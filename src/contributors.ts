import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import type { ContributorSpec, MissionSpec } from "./mission";
import { defaultModelForProvider, runContributorProvider } from "./providers";

export interface ContributorReport {
  contributor: ContributorSpec;
  provider: string;
  model: string;
  text: string;
}

const ROLE_PROMPTS: Record<string, string> = {
  "editorial-review": `You are a senior editor.
Review only prose clarity, sentence rhythm, redundancy, weak verbs, and avoidable abstraction.
Return a terse markdown report with paragraph-anchored issues, lines to cut, and one sharper headline alternative when relevant.`,

  "strategic-review": `You are a strategic reviewer.
Test whether the draft proves its central thesis.
Return a markdown report with a thesis test, top argument gaps, skeptical pushback, recommended fixes, and the single most important addition.`,

  "technical-precision": `You are a technical-precision reviewer.
Flag vague design-speak and missing concretes.
Return a markdown report with a vague-language audit, a picture-this audit, missing specs/screenshots/values, and a trust score from 1-10.`,

  "engineering-docs-review": `You are an engineering-docs reviewer.
Check whether the document is technically coherent, easy to follow, and specific enough for another engineer to act on.
Return a markdown report with correctness risks, missing implementation details, ambiguous terms, and suggested rewrites for the most important unclear passages.`,

  "fresh-context-research": `You are a research reviewer.
Use available current-knowledge or search capabilities to identify facts, examples, recent changes, and external context relevant to the brief.
Return a markdown report with dated claims, source URLs when available, uncertainty notes, and any places the draft should avoid overclaiming.`,
};

export async function runContributorReports(spec: MissionSpec): Promise<ContributorReport[]> {
  const contributors = activeContributors(spec);
  if (contributors.length === 0) return [];

  const inputContext = await buildInputContext(spec);
  const maxTokens = Math.min(spec.budget?.tokens ?? 4096, 12000);

  return Promise.all(contributors.map(async contributor => {
    const model = contributor.model ?? defaultModelForProvider(contributor.provider);
    console.error(`[mw] contributor ${contributor.id} starting (${contributor.provider}/${model})`);

    const response = await runContributorProvider({
      contributor,
      mission: spec,
      system: buildContributorSystemPrompt(contributor),
      prompt: buildContributorUserPrompt(spec, contributor, inputContext),
      maxTokens,
      projectPath: spec.workdir,
    });

    console.error(`[mw] contributor ${contributor.id} done (${response.provider}/${response.model})`);
    return {
      contributor,
      provider: response.provider,
      model: response.model,
      text: response.text,
    };
  }));
}

export function formatContributorReports(reports: ContributorReport[]): string {
  return reports.map(report => [
    `## ${report.contributor.id}`,
    "",
    `Provider: ${report.provider}`,
    `Model: ${report.model}`,
    `Role: ${report.contributor.role}`,
    "",
    report.text.trim(),
  ].join("\n")).join("\n\n---\n\n");
}

function activeContributors(spec: MissionSpec): ContributorSpec[] {
  return (spec.contributors ?? []).filter(contributor => contributor.enabled !== false);
}

function buildContributorSystemPrompt(contributor: ContributorSpec): string {
  const rolePrompt = contributor.prompt ?? ROLE_PROMPTS[contributor.role] ?? `You are a ${contributor.role} contributor.`;
  return `${rolePrompt}

You are one contributor in a multi-model Mission Writer review.
Return only your own markdown report. Do not claim to edit files and do not produce a full rewrite unless the role explicitly asks for one.`;
}

function buildContributorUserPrompt(
  spec: MissionSpec,
  contributor: ContributorSpec,
  inputContext: string,
): string {
  const inputs = spec.inputs?.length ? spec.inputs.map(input => `- ${input}`).join("\n") : "- none listed";
  const outputs = spec.outputs?.length ? spec.outputs.map(output => `- ${output}`).join("\n") : "- none listed";

  return `Mission shape: ${spec.shape}
Contributor id: ${contributor.id}
Contributor role: ${contributor.role}

Inputs:
${inputs}

Outputs:
${outputs}

Brief:
${spec.brief}

=== INPUT CONTEXT ===
${inputContext}`;
}

async function buildInputContext(spec: MissionSpec): Promise<string> {
  if (!spec.inputs?.length) return "(No input files were listed.)";

  const blocks = await Promise.all(spec.inputs.map(async input => {
    const path = resolveInsideWorkdir(spec.workdir, input);
    const content = await readFile(path, "utf8");
    return `--- FILE: ${input} ---\n${content}\n--- END FILE: ${input} ---`;
  }));

  return blocks.join("\n\n");
}

function resolveInsideWorkdir(workdir: string, input: string): string {
  const path = resolve(workdir, input);
  const rel = relative(workdir, path);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`input path escapes workdir: ${input}`);
  }
  return path;
}
