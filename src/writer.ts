import type { MissionSpec } from "./mission.js";

/**
 * Everything a writer needs to drive one mission. The mission-agnostic
 * assembly (contributor reports, framing, brief) is done once in the runner;
 * each writer decides how to hand it to its underlying agent.
 */
export interface MissionWriterContext {
  spec: MissionSpec;
  model: string;
  /** Full prompt: framing + contributor reports + brief. */
  message: string;
  /** Framing/system prompt only (buildSystemPrompt output). */
  systemPrompt: string;
  /** Contributor reports + brief, without the framing prefix. */
  briefWithReports: string;
  hasContributorReports: boolean;
}

/**
 * A writer owns the core agent loop for a file-writing mission: it spawns an
 * agent scoped to the workdir, streams assistant text to stdout and tool/status
 * to stderr, and resolves when the run finishes (throwing on failure).
 */
export interface Writer {
  run(ctx: MissionWriterContext): Promise<void>;
}
