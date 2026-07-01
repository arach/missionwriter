import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

export const TMUX_CAPTURE_LINES = 200;
export const TMUX_READY_TIMEOUT_MS = 20_000;
export const TMUX_READY_POLL_MS = 250;
export const TMUX_PASTE_DRAIN_MS = 150;
export const TMUX_SLASH_TIMEOUT_MS = 120_000;

export function isTmuxSessionAlive(sessionName: string): boolean {
  try {
    execFileSync("tmux", ["has-session", "-t", sessionName], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export function killTmuxSession(sessionName: string): void {
  try {
    execFileSync("tmux", ["kill-session", "-t", sessionName], { stdio: "pipe" });
  } catch {
    // Session may already be gone.
  }
}

export function listMissionWriterTmuxSessions(): Array<{ sessionName: string; createdAt?: string }> {
  try {
    const output = execFileSync(
      "tmux",
      ["list-sessions", "-F", "#{session_name}\t#{session_created}"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return output
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const [sessionName = "", created = ""] = line.split("\t");
        return {
          sessionName,
          createdAt: created ? new Date(Number(created) * 1000).toISOString() : undefined,
        };
      })
      .filter(entry => entry.sessionName.startsWith("mw-"));
  } catch {
    return [];
  }
}

export function captureTmuxPane(sessionName: string, lines = TMUX_CAPTURE_LINES): string {
  try {
    return execFileSync(
      "tmux",
      ["capture-pane", "-p", "-t", sessionName, "-S", `-${lines}`, "-E", "-"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch {
    return "";
  }
}

export async function waitForTmuxHarnessReady(
  sessionName: string,
  timeoutMs = TMUX_READY_TIMEOUT_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let paneTail = "";

  while (Date.now() < deadline) {
    if (!isTmuxSessionAlive(sessionName)) {
      throw new Error(`tmux session ${sessionName} exited before Claude Code was ready`);
    }

    paneTail = captureTmuxPane(sessionName, TMUX_CAPTURE_LINES);
    if (tmuxPaneTailShowsReadyComposer(paneTail)) {
      return;
    }

    await sleep(TMUX_READY_POLL_MS);
  }

  const tail = stripAnsi(paneTail).trim().split(/\r?\n/).slice(-20).join("\n").trim();
  throw new Error(
    `tmux session ${sessionName} did not show a ready Claude Code composer within ${timeoutMs}ms`
      + (tail ? `\nRecent pane tail:\n${tail}` : ""),
  );
}

export async function sendTmuxPrompt(sessionName: string, prompt: string): Promise<void> {
  const bufferName = `mw-prompt-${randomUUID()}`;
  try {
    execFileSync("tmux", ["load-buffer", "-b", bufferName, "-"], {
      stdio: "pipe",
      input: prompt,
    });
    execFileSync("tmux", ["paste-buffer", "-d", "-b", bufferName, "-t", sessionName], {
      stdio: "pipe",
    });
    await sleep(TMUX_PASTE_DRAIN_MS);
    execFileSync("tmux", ["send-keys", "-t", sessionName, "Enter"], { stdio: "pipe" });
  } catch (error) {
    try {
      execFileSync("tmux", ["delete-buffer", "-b", bufferName], { stdio: "pipe" });
    } catch {
      // Ignore cleanup failures after a tmux delivery error.
    }
    throw error;
  }
}

export async function sendTmuxSlashCommand(
  sessionName: string,
  command: string,
  timeoutMs = TMUX_SLASH_TIMEOUT_MS,
): Promise<void> {
  const slash = command.startsWith("/") ? command : `/${command}`;
  await waitForTmuxHarnessReady(sessionName);
  execFileSync("tmux", ["send-keys", "-l", "-t", sessionName, slash], { stdio: "pipe" });
  await sleep(50);
  execFileSync("tmux", ["send-keys", "-t", sessionName, "Enter"], { stdio: "pipe" });
  await waitForTmuxSlashComplete(sessionName, timeoutMs);
}

export async function waitForTmuxContributorOutput(
  sessionName: string,
  baselinePane: string,
  timeoutMs: number,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let sawActivity = false;

  while (Date.now() < deadline) {
    if (!isTmuxSessionAlive(sessionName)) {
      throw new Error(`tmux session ${sessionName} exited before the contributor finished`);
    }

    const pane = captureTmuxPane(sessionName, TMUX_CAPTURE_LINES);
    if (tmuxPaneTailShowsHarnessActivity(pane)) {
      sawActivity = true;
    }

    if (sawActivity && tmuxPaneTailShowsReadyComposer(pane) && !tmuxPaneTailShowsHarnessActivity(pane)) {
      return extractNewPaneText(baselinePane, pane);
    }

    await sleep(250);
  }

  throw new Error(`agent-sessions tmux contributor timed out after ${timeoutMs}ms`);
}

async function waitForTmuxSlashComplete(sessionName: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let sawActivity = false;

  while (Date.now() < deadline) {
    if (!isTmuxSessionAlive(sessionName)) {
      throw new Error(`tmux session ${sessionName} exited while running slash command`);
    }

    const pane = captureTmuxPane(sessionName, TMUX_CAPTURE_LINES);
    if (tmuxPaneTailShowsHarnessActivity(pane)) {
      sawActivity = true;
    }

    if (sawActivity && tmuxPaneTailShowsReadyComposer(pane) && !tmuxPaneTailShowsHarnessActivity(pane)) {
      return;
    }

    if (!sawActivity && tmuxPaneTailShowsReadyComposer(pane)) {
      return;
    }

    await sleep(250);
  }

  throw new Error(`tmux slash command timed out after ${timeoutMs}ms in ${sessionName}`);
}

export function tmuxPaneTailShowsReadyComposer(paneTail: string): boolean {
  const cleanedTail = stripAnsi(paneTail);
  const lines = cleanedTail.split(/\r?\n/);
  const anchor = findActiveTmuxComposerAnchor(lines);
  if (!anchor) {
    return false;
  }

  const afterComposerLines: string[] = [];
  for (const line of lines.slice(anchor.index + 1)) {
    if (isTmuxComposerBoundary(line)) {
      break;
    }
    afterComposerLines.push(line);
  }
  return !tmuxPaneTailShowsHarnessActivity(afterComposerLines.join("\n"));
}

export function tmuxPaneTailShowsHarnessActivity(paneTail: string): boolean {
  return /(?:^|\n)\s*(?:[⏺●✽✢✻⎿]|Bash\(|Read\(|Edit\(|Write\(|Grep\(|Glob\(|TodoWrite\()/.test(
    stripAnsi(paneTail),
  );
}

function extractNewPaneText(baselinePane: string, currentPane: string): string {
  const baseline = stripAnsi(baselinePane).trim();
  const current = stripAnsi(currentPane).trim();

  if (current.startsWith(baseline)) {
    return cleanContributorPaneText(current.slice(baseline.length));
  }

  const baselineLines = baseline.split(/\r?\n/);
  const currentLines = current.split(/\r?\n/).slice(baselineLines.length);
  return cleanContributorPaneText(currentLines.join("\n"));
}

function cleanContributorPaneText(value: string): string {
  return value
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(line => line.trim())
    .filter(line => !isTmuxUiChrome(line))
    .join("\n")
    .trim();
}

function findActiveTmuxComposerAnchor(lines: readonly string[]): { index: number } | null {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index] ?? "";
    if (/^\s*[❯›]\s*/.test(line) || /^\s*[│┃]\s*[>❯]\s*/.test(line)) {
      return { index };
    }
  }
  return null;
}

function isTmuxComposerBoundary(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }
  if (/^[─━═╭╮╰╯┌┐└┘╔╗╚╝╟╢╠╣╪╫╬╩╦╤╧╌╍╎╏\s]+$/.test(trimmed)) {
    return true;
  }
  return /^--\s*(?:INSERT|NORMAL)\s*--/.test(trimmed)
    || /^(?:Opus|Sonnet|Haiku|Claude|Codex|GPT)\b/.test(trimmed);
}

function isTmuxUiChrome(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^\s*[❯›]\s*$/.test(trimmed)) return true;
  if (/^\s*[│┃]/.test(trimmed)) return true;
  if (/^[─━═╭╮╰╯┌┐└┘╔╗╚╝\s]+$/.test(trimmed)) return true;
  return /^--\s*(?:INSERT|NORMAL)\s*--/.test(trimmed);
}

export function shellQuote(value: string): string {
  return JSON.stringify(value);
}

function stripAnsi(value: string): string {
  return value.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}