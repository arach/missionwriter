import { execFileSync } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_AGENT_SESSIONS_MODEL } from "./agent-sessions";
import type { AgentSessionsContributorRequest, AgentSessionsContributorResponse } from "./agent-sessions";
import {
  captureTmuxPane,
  isTmuxSessionAlive,
  killTmuxSession,
  sendTmuxPrompt,
  shellQuote,
  TMUX_CAPTURE_LINES,
  waitForTmuxContributorOutput,
  waitForTmuxHarnessReady,
} from "./tmux-control";
import {
  acquireTmuxSession,
  completeTmuxTurn,
  markTmuxPromptSent,
  markTmuxSessionReady,
  type ResolvedTmuxSessionPolicy,
} from "./tmux-session-registry";

const TURN_TIMEOUT_MS = 600_000;
const TMUX_COLUMNS = 160;
const TMUX_ROWS = 48;

export async function runAgentSessionsTmuxContributor(
  request: AgentSessionsContributorRequest,
): Promise<AgentSessionsContributorResponse> {
  const model = request.model ?? DEFAULT_AGENT_SESSIONS_MODEL;
  const cwd = request.cwd;
  const lease = acquireTmuxSession({
    contributorId: request.contributorId,
    cwd,
    model,
    policy: request.tmux,
  });

  try {
    if (!lease.reused) {
      const tempDir = await mkdtemp(join(tmpdir(), "mw-tmux-"));
      try {
        await spawnFreshTmuxSession({
          sessionName: lease.sessionName,
          contributorId: request.contributorId,
          cwd,
          model,
          system: request.system,
          tempDir,
        });
        markTmuxSessionReady(lease.key);
      } finally {
        await rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    } else if (!isTmuxSessionAlive(lease.sessionName)) {
      throw new Error(`tmux session ${lease.sessionName} disappeared before reuse`);
    } else {
      await waitForTmuxHarnessReady(lease.sessionName);
    }

    const baselinePane = captureTmuxPane(lease.sessionName, TMUX_CAPTURE_LINES);
    markTmuxPromptSent(lease.key);
    await sendTmuxPrompt(lease.sessionName, request.prompt);

    const text = await waitForTmuxContributorOutput(lease.sessionName, baselinePane, TURN_TIMEOUT_MS);
    if (!text) {
      throw new Error("agent-sessions tmux contributor returned empty output");
    }

    completeTmuxTurn(lease.key);
    return { model, text };
  } catch (error) {
    if (!isTmuxSessionAlive(lease.sessionName)) {
      killTmuxSession(lease.sessionName);
    }
    throw error;
  }
}

async function spawnFreshTmuxSession(input: {
  sessionName: string;
  contributorId: string;
  cwd: string;
  model: string;
  system: string;
  tempDir: string;
}): Promise<void> {
  const promptFile = join(input.tempDir, "system-prompt.txt");
  const launchScript = join(input.tempDir, "launch.sh");

  await writeFile(promptFile, input.system, "utf8");
  const modelArgs = input.model ? ` --model ${shellQuote(input.model)}` : "";
  await writeFile(
    launchScript,
    [
      "#!/bin/bash",
      "set -uo pipefail",
      `cd ${shellQuote(input.cwd)}`,
      `exec claude --append-system-prompt "$(cat ${shellQuote(promptFile)})" --name ${shellQuote(`mw-${input.contributorId}`)}${modelArgs}`,
    ].join("\n") + "\n",
    "utf8",
  );
  await chmod(launchScript, 0o755);

  spawnTmuxSession(input.sessionName, input.cwd, launchScript);
  await waitForTmuxHarnessReady(input.sessionName);
}

function spawnTmuxSession(sessionName: string, cwd: string, launchScript: string): void {
  if (isTmuxSessionAlive(sessionName)) {
    killTmuxSession(sessionName);
  }

  execFileSync(
    "tmux",
    [
      "new-session",
      "-d",
      "-x", String(TMUX_COLUMNS),
      "-y", String(TMUX_ROWS),
      "-s", sessionName,
      "-c", cwd,
      `exec bash ${shellQuote(launchScript)}`,
    ],
    { stdio: "pipe" },
  );
}

export type { ResolvedTmuxSessionPolicy };
