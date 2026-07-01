import { randomUUID } from "node:crypto";

import {
  createClaudeCodeAdapter,
  SessionRegistry,
  type PairingEvent,
  type TurnStatus,
} from "@openscout/agent-sessions";

import { runAgentSessionsTmuxContributor } from "./agent-sessions-tmux.js";
import type { ResolvedTmuxSessionPolicy } from "./tmux-session-registry.js";

export const DEFAULT_AGENT_SESSIONS_MODEL = "claude-opus-4-8";

export type AgentSessionTransport = "direct" | "tmux";

const TURN_TIMEOUT_MS = 600_000;

export interface AgentSessionsContributorRequest {
  contributorId: string;
  model?: string;
  transport?: AgentSessionTransport;
  tmux?: ResolvedTmuxSessionPolicy;
  system: string;
  prompt: string;
  cwd: string;
}

export interface AgentSessionsContributorResponse {
  model: string;
  text: string;
}

export async function runAgentSessionsContributor(
  request: AgentSessionsContributorRequest,
): Promise<AgentSessionsContributorResponse> {
  if (request.transport === "tmux") {
    return runAgentSessionsTmuxContributor(request);
  }

  return runAgentSessionsDirectContributor(request);
}

async function runAgentSessionsDirectContributor(
  request: AgentSessionsContributorRequest,
): Promise<AgentSessionsContributorResponse> {
  const model = request.model ?? DEFAULT_AGENT_SESSIONS_MODEL;
  const sessionId = `mw-${request.contributorId}-${randomUUID()}`;
  const registry = new SessionRegistry({
    adapters: {
      "claude-code": createClaudeCodeAdapter,
    },
  });

  const chunks: string[] = [];
  const turn = {
    status: null as TurnStatus | null,
    error: null as string | null,
  };

  const stopListening = registry.onEvent(sequenced => {
    const event = sequenced.event as PairingEvent;
    if (!("sessionId" in event) || event.sessionId !== sessionId) return;

    if (event.event === "block:delta" && typeof event.text === "string") {
      chunks.push(event.text);
    }
    if (event.event === "turn:end") {
      turn.status = event.status;
    }
    if (event.event === "turn:error") {
      turn.error = event.message;
    }
  });

  try {
    await registry.createSession("claude-code", {
      sessionId,
      cwd: request.cwd,
      options: {
        model,
        systemPrompt: request.system,
      },
    });

    registry.send({ sessionId, text: request.prompt });
    await waitForTurn(() => turn.status, () => turn.error, TURN_TIMEOUT_MS);

    if (turn.error) {
      throw new Error(`agent-sessions contributor failed: ${turn.error}`);
    }
    if (turn.status !== "completed") {
      throw new Error(`agent-sessions contributor ended with status ${turn.status ?? "unknown"}`);
    }

    const text = chunks.join("").trim();
    if (!text) {
      throw new Error("agent-sessions contributor returned empty output");
    }

    return { model, text };
  } finally {
    stopListening();
    await registry.shutdown();
  }
}

async function waitForTurn(
  getStatus: () => TurnStatus | null,
  getError: () => string | null,
  timeoutMs: number,
): Promise<void> {
  const started = Date.now();
  while (!getStatus() && !getError()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`agent-sessions contributor timed out after ${timeoutMs}ms`);
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}