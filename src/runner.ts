import { Agent } from "@cursor/sdk";
import type { AgentDefinition, AgentOptions } from "@cursor/sdk";

import { formatContributorReports, runContributorReports } from "./contributors.js";
import type { MissionSpec, ProviderId } from "./mission.js";
import { buildSystemPrompt } from "./shapes.js";
import { resolveProviderApiKey } from "./auth.js";
import {
  defaultResolvedPolicy,
  finalizeTmuxSessions,
  listTrackedTmuxSessions,
  mergeTmuxPolicy,
  setTmuxDefaultPolicy,
} from "./tmux-session-registry.js";

const DEFAULT_MODEL = "default";

interface MissionWriter {
  provider: ProviderId;
  model: string;
}

export async function runMission(spec: MissionSpec): Promise<void> {
  const writer = resolveWriter(spec);
  if (writer.provider !== "cursor") {
    throw new Error(`writer provider '${writer.provider}' is not supported for file-writing missions yet; use non-Cursor providers as contributors`);
  }

  const tmuxPolicy = mergeTmuxPolicy(spec.tmux);
  setTmuxDefaultPolicy(tmuxPolicy);

  let agent: Awaited<ReturnType<typeof Agent.create>> | undefined;
  try {
    const contributorReports = await runContributorReports(spec);
    const apiKey = resolveProviderApiKey("cursor");
    const model = { id: writer.model };

    const options: AgentOptions = {
      apiKey,
      model,
      name: `mw:${spec.shape}`,
      local: { cwd: spec.workdir },
      agents: spec.shape === "review-rewrite" && contributorReports.length === 0 ? reviewerSubagents() : undefined,
    };

    const framing = buildSystemPrompt(spec, { hasContributorReports: contributorReports.length > 0 });
    const reports = contributorReports.length > 0
      ? `\n\n=== CONTRIBUTOR REPORTS ===\n${formatContributorReports(contributorReports)}`
      : "";
    const message = `${framing}${reports}\n\n=== BRIEF ===\n${spec.brief}`;

    console.error(`[mw] starting ${spec.shape} mission in ${spec.workdir} (model=${model.id})`);

    agent = await Agent.create(options);
    const run = await agent.send(message);

    for await (const event of run.stream()) {
      logEvent(event);
    }

    const result = await run.wait();
    console.error(`[mw] done. status=${result.status} duration=${run.durationMs ?? "?"}ms`);
  } finally {
    agent?.close();
    await finalizeTmuxSessions(defaultResolvedPolicy({ onMissionEnd: tmuxPolicy.onMissionEnd }));
    if (tmuxPolicy.onMissionEnd !== "kill") {
      for (const session of listTrackedTmuxSessions()) {
        console.error(`[mw:tmux] left running: ${session.contributorId} → ${session.attach}`);
      }
    }
  }
}

function resolveWriter(spec: MissionSpec): MissionWriter {
  return {
    provider: spec.writer?.provider ?? spec.provider ?? "cursor",
    model: spec.writer?.model ?? spec.model ?? DEFAULT_MODEL,
  };
}

function logEvent(event: unknown): void {
  if (typeof event !== "object" || event === null) return;
  const e = event as Record<string, unknown>;
  const type = typeof e.type === "string" ? e.type : "?";

  if (type === "assistant" && typeof (e as { message?: unknown }).message === "object") {
    const msg = (e as { message: { content?: unknown } }).message;
    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block && typeof block === "object" && (block as { type?: string }).type === "text") {
          process.stdout.write((block as { text?: string }).text ?? "");
        }
      }
    }
    return;
  }
  if (type === "tool_use") {
    const name = (e as { name?: string }).name ?? "tool";
    process.stderr.write(`\n[tool] ${name}\n`);
    return;
  }
  if (type === "result") {
    process.stderr.write(`\n[result] ${(e as { status?: string }).status ?? ""}\n`);
  }
}

function reviewerSubagents(): Record<string, AgentDefinition> {
  return {
    editor: {
      description: "Editorial reviewer focused on prose clarity, sentence rhythm, redundancy, and weak verbs.",
      prompt: `You are a senior editor. Review the listed inputs for editorial clarity ONLY.
Output a markdown report: Top issues (paragraph-anchored), lines to cut entirely, and one sharper headline alternative.
Be terse and specific. No filler.`,
    },
    strategist: {
      description: "Strategic reviewer focused on argument structure, thesis evidence, and skeptical pushback.",
      prompt: `You are a strategic editor. Test whether the input proves its central thesis.
Output: thesis test (3 sentences), top argument gaps (each: pushback + fix), structural recommendations, and the single most important addition.`,
    },
    technician: {
      description: "Technical-precision reviewer that flags vague design-speak and missing concretes.",
      prompt: `You are a precise design-systems reviewer. Flag every imprecise phrase verbatim with paragraph reference.
Output: vague-language audit (table), picture-this audit (can readers draw the UI from the description?), missing concretes (specs/screenshots/values needed), trust score 1-10.`,
    },
  };
}
