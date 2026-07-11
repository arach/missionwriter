import { spawn } from "node:child_process";

import {
  DEFAULT_AGENT_SESSIONS_MODEL,
  runAgentSessionsContributor,
} from "./agent-sessions";
import { resolveProviderApiKey } from "./auth";
import type { ContributorSpec, MissionSpec, ProviderId } from "./mission";
import { mergeTmuxPolicy } from "./tmux-session-registry";

export interface ContributorProviderRequest {
  contributor: ContributorSpec;
  mission?: Pick<MissionSpec, "tmux">;
  system: string;
  prompt: string;
  maxTokens?: number;
  projectPath?: string;
}

export interface ContributorProviderResponse {
  provider: ProviderId;
  model: string;
  text: string;
}

interface OpenAiCompatibleConfig {
  endpoint: string;
  headers?: Record<string, string>;
  maxTokensField?: "max_tokens" | "max_completion_tokens";
  maxTokensCap?: number;
}

const DEFAULT_MODELS: Record<ProviderId, string> = {
  // eve is a writer provider, not a contributor; pi resolves its own default
  // model from ~/.pi settings. This entry is only here to satisfy the map.
  eve: "default",
  cursor: "default",
  xai: "grok-4.3",
  openrouter: "openrouter/auto",
  minimax: "MiniMax-M3",
  "copilot-cli": "gemini-3.1-pro-preview",
  "agent-sessions": DEFAULT_AGENT_SESSIONS_MODEL,
};

const OPENAI_COMPATIBLE: Partial<Record<ProviderId, OpenAiCompatibleConfig>> = {
  xai: {
    endpoint: "https://api.x.ai/v1/chat/completions",
  },
  openrouter: {
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    headers: {
      "X-Title": "missionwriter",
    },
  },
  minimax: {
    endpoint: "https://api.minimax.io/v1/chat/completions",
    maxTokensField: "max_completion_tokens",
    maxTokensCap: 2048,
  },
};

export function defaultModelForProvider(provider: ProviderId): string {
  return DEFAULT_MODELS[provider];
}

export async function runContributorProvider(
  request: ContributorProviderRequest,
): Promise<ContributorProviderResponse> {
  const provider = request.contributor.provider;
  if (provider === "copilot-cli") {
    return runCopilotCliContributor(request);
  }
  if (provider === "agent-sessions") {
    return runAgentSessionsContributorProvider(request);
  }
  if (provider === "cursor") {
    throw new Error("Cursor contributors are only supported through native Cursor subagents for now");
  }
  return runOpenAiCompatibleContributor(request);
}

async function runOpenAiCompatibleContributor(
  request: ContributorProviderRequest,
): Promise<ContributorProviderResponse> {
  const provider = request.contributor.provider;
  const config = OPENAI_COMPATIBLE[provider];
  if (!config) {
    throw new Error(`provider '${provider}' is not configured as an OpenAI-compatible contributor`);
  }

  const apiKey = resolveProviderApiKey(provider);
  const model = request.contributor.model ?? defaultModelForProvider(provider);
  const maxTokens = request.maxTokens
    ? Math.min(request.maxTokens, config.maxTokensCap ?? request.maxTokens)
    : undefined;
  const body = {
    model,
    messages: [
      { role: "system", content: request.system },
      { role: "user", content: request.prompt },
    ],
    stream: false,
    ...(maxTokens ? { [config.maxTokensField ?? "max_tokens"]: maxTokens } : {}),
  };

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...config.headers,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${provider} contributor request failed: HTTP ${response.status} ${truncate(text)}`);
  }

  const json = await response.json() as {
    choices?: Array<{ message?: { content?: unknown } }>;
    model?: unknown;
  };
  const rawText = json.choices?.[0]?.message?.content;
  if (typeof rawText !== "string" || !rawText.trim()) {
    throw new Error(`${provider} contributor response did not include text content`);
  }
  const text = stripThinkingBlocks(rawText);

  return {
    provider,
    model: typeof json.model === "string" ? json.model : model,
    text,
  };
}

async function runAgentSessionsContributorProvider(
  request: ContributorProviderRequest,
): Promise<ContributorProviderResponse> {
  const response = await runAgentSessionsContributor({
    contributorId: request.contributor.id,
    model: request.contributor.model,
    transport: request.contributor.transport,
    tmux: mergeTmuxPolicy(request.mission?.tmux, request.contributor.tmux),
    system: request.system,
    prompt: request.prompt,
    cwd: request.projectPath ?? process.cwd(),
  });

  return {
    provider: "agent-sessions",
    model: response.model,
    text: response.text,
  };
}

async function runCopilotCliContributor(
  request: ContributorProviderRequest,
): Promise<ContributorProviderResponse> {
  const model = request.contributor.model ?? defaultModelForProvider("copilot-cli");
  const maxTokens = request.maxTokens ?? 4096;
  const output = await runCommand(
    "copilot-ask",
    ["--model", model, "--system", request.system, "--max-tokens", String(maxTokens)],
    request.prompt,
  );

  if (!output.trim()) {
    throw new Error("copilot-cli contributor returned an empty response");
  }

  return {
    provider: "copilot-cli",
    model,
    text: output,
  };
}

async function runCommand(
  command: string,
  args: string[],
  input: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => {
      stdout += String(chunk);
    });
    child.stderr.on("data", chunk => {
      stderr += String(chunk);
    });
    child.on("error", error => {
      reject(error);
    });
    child.on("close", code => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`${command} failed with exit code ${code ?? "unknown"}: ${truncate(stderr)}`));
      }
    });
    child.stdin.end(input);
  });
}

function truncate(value: string, max = 1000): string {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}...` : trimmed;
}

function stripThinkingBlocks(value: string): string {
  return value.replace(/<think>[\s\S]*?<\/think>\s*/gi, "").trim();
}
