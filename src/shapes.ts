import type { MissionShape, MissionSpec, ProviderId } from "./mission.js";

export interface BuildSystemPromptOptions {
  hasContributorReports?: boolean;
  writerProvider?: ProviderId;
}

const SHARED_PREAMBLE = `You are operating inside a working directory as an autonomous writing/review agent.
You have file tools (read, write, edit, glob, grep) scoped to this directory.
Stay inside the directory. Do not modify files outside the listed inputs/outputs.
When you finish, summarize what you wrote and where.`;

const SHAPE_INSTRUCTIONS: Record<MissionShape, string> = {
  review: `MISSION SHAPE: review
Read the listed inputs. Produce a single \`reviews.md\` (or the named output) containing a structured critique.
Do not edit the source files. Do not produce a rewrite — only the review report.`,

  write: `MISSION SHAPE: write
Synthesize the brief into the named output file(s). If no output is named, default to draft.md in the workdir.
Read any listed inputs as research material. Do not modify inputs.`,

  "review-rewrite": `MISSION SHAPE: review-rewrite
Two-phase mission:
  1. Review the listed inputs against the brief. Use the Task tool to spawn 2-3 review subagents
     in parallel, each with a distinct lens (editorial / strategic / technical-precision is a good default).
     Consolidate their reports into reviews.md.
  2. Produce a rewritten draft applying the consensus fixes. Save as draft.md or the named output.
Preserve any YAML frontmatter on input files exactly when rewriting.`,
};

const CONTRIBUTOR_REPORT_INSTRUCTIONS: Partial<Record<MissionShape, string>> = {
  review: `Contributor reports have already been gathered.
Use them as source material, resolve contradictions, and produce the final review report in the named output.
Do not edit the source files.`,

  "review-rewrite": `Contributor reports have already been gathered.
Use them as the review phase. Consolidate their strongest findings into reviews.md or the named review output.
Then produce a rewritten draft applying the consensus fixes. Save as draft.md or the named output.
Preserve any YAML frontmatter on input files exactly when rewriting.`,
};

export function buildSystemPrompt(spec: MissionSpec, options: BuildSystemPromptOptions = {}): string {
  const inputs = spec.inputs?.length ? `\nInputs:\n${spec.inputs.map(p => `  - ${p}`).join("\n")}` : "";
  const outputs = spec.outputs?.length ? `\nOutputs:\n${spec.outputs.map(p => `  - ${p}`).join("\n")}` : "";
  const budget = spec.budget
    ? `\nBudget: ${spec.budget.tokens ?? "—"} tokens, ${spec.budget.toolCalls ?? "—"} tool calls. Halt and report when reached.`
    : "";
  const shapeInstructions = resolveShapeInstructions(spec, options);

  return [
    SHARED_PREAMBLE,
    "",
    shapeInstructions,
    "",
    `Workdir: ${spec.workdir}${inputs}${outputs}${budget}`,
  ].join("\n");
}

function resolveShapeInstructions(spec: MissionSpec, options: BuildSystemPromptOptions): string {
  if (options.hasContributorReports && CONTRIBUTOR_REPORT_INSTRUCTIONS[spec.shape]) {
    return CONTRIBUTOR_REPORT_INSTRUCTIONS[spec.shape]!;
  }
  // Eve (pi) fans out review voices via pi's `subagent` tool + reviewer agents,
  // rather than Cursor's native reviewer subagents.
  if (spec.shape === "review-rewrite" && options.writerProvider === "eve") {
    return eveReviewRewriteInstructions(spec);
  }
  return SHAPE_INSTRUCTIONS[spec.shape];
}

function eveReviewRewriteInstructions(spec: MissionSpec): string {
  const inputList = spec.inputs?.length ? spec.inputs.join(", ") : "the listed input file(s)";
  return `MISSION SHAPE: review-rewrite (Eve subagents)
Two phases:
  1. REVIEW — Make a SINGLE call to the \`subagent\` tool in PARALLEL mode: pass a \`tasks\` array with
     three entries, one per reviewer agent — "editorial", "strategic", and "technical". Each task tells
     that agent to review ${inputList} against the brief (the technical reviewer should also read
     README.md to verify accuracy). One call runs all three in parallel; wait for their reports.
  2. REWRITE — Consolidate the three reports into the review output (reviews.md or the named review
     output), then rewrite ${inputList} applying the consensus fixes. Save as the named output.
Preserve any YAML frontmatter on input files exactly when rewriting.`;
}
