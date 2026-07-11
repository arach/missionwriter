import { formatContributorReports, runContributorReports } from "./contributors";
import type { MissionSpec, ProviderId } from "./mission";
import { buildSystemPrompt } from "./shapes";
import { CursorWriter } from "./cursor-writer";
import { EveWriter } from "./eve-writer";
import { startRun } from "./runs";
import type { RunMeta } from "./runs";
import type { Writer } from "./writer";
import {
  defaultResolvedPolicy,
  finalizeTmuxSessions,
  listTrackedTmuxSessions,
  mergeTmuxPolicy,
  setTmuxDefaultPolicy,
} from "./tmux-session-registry";

const DEFAULT_MODEL = "default";

export interface RunMissionOptions {
  writer?: Writer;
}

export async function runMission(spec: MissionSpec, options: RunMissionOptions = {}): Promise<RunMeta> {
  const { provider, model } = resolveWriter(spec);
  const writer = options.writer ?? createWriter(provider);
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
    return run.finish("finished");
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
