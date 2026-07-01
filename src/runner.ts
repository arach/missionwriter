import { formatContributorReports, runContributorReports } from "./contributors.js";
import type { MissionSpec, ProviderId } from "./mission.js";
import { buildSystemPrompt } from "./shapes.js";
import { CursorWriter } from "./cursor-writer.js";
import { EveWriter } from "./eve-writer.js";
import { startRun } from "./runs.js";
import type { Writer } from "./writer.js";
import {
  defaultResolvedPolicy,
  finalizeTmuxSessions,
  listTrackedTmuxSessions,
  mergeTmuxPolicy,
  setTmuxDefaultPolicy,
} from "./tmux-session-registry.js";

const DEFAULT_MODEL = "default";

export async function runMission(spec: MissionSpec): Promise<void> {
  const { provider, model } = resolveWriter(spec);
  const writer = createWriter(provider);
  const run = startRun(spec, provider, model);

  const tmuxPolicy = mergeTmuxPolicy(spec.tmux);
  setTmuxDefaultPolicy(tmuxPolicy);

  try {
    const contributorReports = await runContributorReports(spec);
    const hasContributorReports = contributorReports.length > 0;

    // Mission-agnostic assembly: framing (system prompt), contributor reports,
    // and the brief. Writers consume `message` (all-in-one) or the split parts.
    const systemPrompt = buildSystemPrompt(spec, { hasContributorReports, writerProvider: provider });
    const reportsBlock = hasContributorReports
      ? `=== CONTRIBUTOR REPORTS ===\n${formatContributorReports(contributorReports)}\n\n`
      : "";
    const briefWithReports = `${reportsBlock}=== BRIEF ===\n${spec.brief}`;
    const message = `${systemPrompt}\n\n${briefWithReports}`;

    await writer.run({
      spec,
      model,
      message,
      systemPrompt,
      briefWithReports,
      hasContributorReports,
      runDir: run.dir,
    });
    run.finish("finished");
  } catch (error) {
    run.finish("failed", error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    await finalizeTmuxSessions(defaultResolvedPolicy({ onMissionEnd: tmuxPolicy.onMissionEnd }));
    if (tmuxPolicy.onMissionEnd !== "kill") {
      for (const session of listTrackedTmuxSessions()) {
        console.error(`[mw:tmux] left running: ${session.contributorId} → ${session.attach}`);
      }
    }
    console.error(`[mw] run saved → ${run.dir}  (mw show ${run.dir.split("/").pop()})`);
  }
}

interface WriterSelection {
  provider: ProviderId;
  model: string;
}

function resolveWriter(spec: MissionSpec): WriterSelection {
  return {
    provider: spec.writer?.provider ?? spec.provider ?? "eve",
    model: spec.writer?.model ?? spec.model ?? DEFAULT_MODEL,
  };
}

function createWriter(provider: ProviderId): Writer {
  switch (provider) {
    case "eve":
      return new EveWriter();
    case "cursor":
      return new CursorWriter();
    default:
      throw new Error(
        `writer provider '${provider}' is not a file-writing writer; use 'eve' or 'cursor' (other providers run as contributors)`,
      );
  }
}
