import { spawnSync } from "node:child_process";

import { sendTmuxSlashCommand } from "./tmux-control.js";
import {
  isTmuxSessionAlive,
  killTmuxSession,
  listTmuxSessionCatalog,
  loadPersistedTmuxTimeline,
  recordTmuxSessionAction,
  removePersistedTmuxSession,
  resolveTmuxSessionName,
} from "./tmux-session-registry.js";

const SESSION_HELP = `mw session — manage Mission Writer tmux contributor sessions

Usage:
  mw session list [--all]
  mw session attach <contributor-id|session-name> [--exec]
  mw session compact <contributor-id|session-name>
  mw session clear <contributor-id|session-name>
  mw session kill <contributor-id|session-name>
  mw session timeline [contributor-id|session-name]

Sessions use stable tmux names: mw-<contributor-id>
State is tracked in ~/.missionwriter/tmux-sessions.json`;

export async function runSessionCommand(args: string[]): Promise<void> {
  const action = args[0];
  if (!action || action === "help" || action === "--help" || action === "-h") {
    console.error(SESSION_HELP);
    return;
  }

  switch (action) {
    case "list":
      await runSessionList(args.slice(1));
      return;
    case "attach":
      await runSessionAttach(args.slice(1));
      return;
    case "compact":
      await runSessionSlash(args.slice(1), "compact");
      return;
    case "clear":
      await runSessionSlash(args.slice(1), "clear");
      return;
    case "kill":
      await runSessionKill(args.slice(1));
      return;
    case "timeline":
      await runSessionTimeline(args.slice(1));
      return;
    default:
      throw new Error(`unknown session action: ${action} (try: mw session help)`);
  }
}

async function runSessionList(args: string[]): Promise<void> {
  const includeDead = args.includes("--all");
  const sessions = await listTmuxSessionCatalog({ includeDead });

  if (sessions.length === 0) {
    console.error("[mw:session] no tmux contributor sessions found");
    return;
  }

  for (const session of sessions) {
    const status = session.alive ? session.state : "dead";
    const model = session.model ? ` model=${session.model}` : "";
    const cwd = session.cwd ? ` cwd=${session.cwd}` : "";
    console.error(
      `[mw:session] ${session.contributorId} ${session.sessionName} ${status}${model}${cwd}`,
    );
    console.error(`             attach: ${session.attach}`);
  }
}

async function runSessionAttach(args: string[]): Promise<void> {
  const exec = args.includes("--exec");
  const target = positionalArgs(args)[0];
  if (!target) {
    throw new Error("session attach needs <contributor-id|session-name>");
  }

  const sessionName = resolveTmuxSessionName(target);
  if (!isTmuxSessionAlive(sessionName)) {
    throw new Error(`tmux session not running: ${sessionName}`);
  }

  const command = `tmux attach -t ${sessionName}`;
  await recordTmuxSessionAction(sessionName, "attach", command);

  if (exec) {
    const result = spawnSync("tmux", ["attach", "-t", sessionName], { stdio: "inherit" });
    if (typeof result.status === "number" && result.status !== 0) {
      process.exitCode = result.status;
    }
    return;
  }

  console.log(command);
}

async function runSessionSlash(
  args: string[],
  command: "compact" | "clear",
): Promise<void> {
  const target = positionalArgs(args)[0];
  if (!target) {
    throw new Error(`session ${command} needs <contributor-id|session-name>`);
  }

  const sessionName = resolveTmuxSessionName(target);
  if (!isTmuxSessionAlive(sessionName)) {
    throw new Error(`tmux session not running: ${sessionName}`);
  }

  console.error(`[mw:session] ${command} ${sessionName}`);
  await sendTmuxSlashCommand(sessionName, `/${command}`);
  await recordTmuxSessionAction(sessionName, command);
  console.error(`[mw:session] ${command} complete for ${sessionName}`);
}

async function runSessionKill(args: string[]): Promise<void> {
  const target = positionalArgs(args)[0];
  if (!target) {
    throw new Error("session kill needs <contributor-id|session-name>");
  }

  const sessionName = resolveTmuxSessionName(target);
  await recordTmuxSessionAction(sessionName, "killed", "mw session kill");
  killTmuxSession(sessionName);
  await removePersistedTmuxSession(sessionName);
  console.error(`[mw:session] killed ${sessionName}`);
}

async function runSessionTimeline(args: string[]): Promise<void> {
  const target = positionalArgs(args)[0];
  const events = await loadPersistedTmuxTimeline(target);

  if (events.length === 0) {
    console.error("[mw:session] no timeline events found");
    return;
  }

  for (const event of events) {
    const detail = event.detail ? ` ${event.detail}` : "";
    console.error(`${event.at} ${event.sessionName} ${event.type}${detail}`);
  }
}

function positionalArgs(args: string[]): string[] {
  return args.filter(arg => !arg.startsWith("--"));
}