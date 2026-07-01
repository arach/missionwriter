import { Agent } from "@cursor/sdk";
import type { AgentDefinition, AgentOptions } from "@cursor/sdk";

import { resolveProviderApiKey } from "./auth.js";
import type { MissionWriterContext, Writer } from "./writer.js";

/**
 * Cursor Agent SDK writer: spawns a Cursor agent scoped to the workdir with its
 * built-in file tools, sends the assembled message, and streams the run.
 */
export class CursorWriter implements Writer {
  async run({ spec, model, message, hasContributorReports }: MissionWriterContext): Promise<void> {
    const apiKey = resolveProviderApiKey("cursor");

    const options: AgentOptions = {
      apiKey,
      model: { id: model },
      name: `mw:${spec.shape}`,
      local: { cwd: spec.workdir },
      agents: spec.shape === "review-rewrite" && !hasContributorReports ? reviewerSubagents() : undefined,
    };

    console.error(`[mw] starting ${spec.shape} mission in ${spec.workdir} (writer=cursor model=${model})`);

    const agent = await Agent.create(options);
    try {
      const run = await agent.send(message);
      for await (const event of run.stream()) {
        logEvent(event);
      }
      const result = await run.wait();
      console.error(`[mw] done. status=${result.status} duration=${run.durationMs ?? "?"}ms`);
    } finally {
      agent.close();
    }
  }
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
