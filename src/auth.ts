import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

import type { ProviderId } from "./mission.js";

const CURSOR_KEY_FILE = join(homedir(), ".cursor", "api_key.env");
const PROVIDERS_KEY_FILE = join(homedir(), ".missionwriter", "providers.env");

interface ProviderSecretConfig {
  displayName: string;
  envVars: string[];
  keyFiles: string[];
  secretName?: string;
}

const PROVIDER_SECRETS: Record<ProviderId, ProviderSecretConfig | null> = {
  // eve drives the `pi` coding agent, which resolves its own credentials
  // (~/.pi/agent/auth.json or provider env vars) — no missionwriter-held key.
  eve: null,
  cursor: {
    displayName: "Cursor",
    envVars: ["CURSOR_API_KEY"],
    keyFiles: [PROVIDERS_KEY_FILE, CURSOR_KEY_FILE],
    secretName: "CURSOR_API_KEY",
  },
  xai: {
    displayName: "xAI",
    envVars: ["XAI_API_KEY"],
    keyFiles: [PROVIDERS_KEY_FILE],
    secretName: "XAI_API_KEY",
  },
  openrouter: {
    displayName: "OpenRouter",
    envVars: ["OPENROUTER_API_KEY"],
    keyFiles: [PROVIDERS_KEY_FILE],
    secretName: "OPENROUTER_API_KEY",
  },
  minimax: {
    displayName: "MiniMax",
    envVars: ["MINIMAX_API_KEY"],
    keyFiles: [PROVIDERS_KEY_FILE],
    secretName: "MINIMAX_API_KEY",
  },
  "copilot-cli": null,
  "agent-sessions": null,
};

const API_KEY_CACHE = new Map<ProviderId, string>();

export function resolveApiKey(): string {
  return resolveProviderApiKey("cursor");
}

export function resolveProviderApiKey(provider: ProviderId): string {
  const cached = API_KEY_CACHE.get(provider);
  if (cached) return cached;

  const config = PROVIDER_SECRETS[provider];
  if (!config) {
    throw new Error(`provider '${provider}' does not use a Mission Writer API key`);
  }

  for (const envVar of config.envVars) {
    const fromEnv = process.env[envVar];
    if (fromEnv) return cacheApiKey(provider, fromEnv);
  }

  for (const keyFile of config.keyFiles) {
    const fromFile = readKeyFile(keyFile, config.envVars);
    if (fromFile) return cacheApiKey(provider, fromFile);
  }

  if (config.secretName) {
    const fromSecret = readSecret(config.secretName);
    if (fromSecret) return cacheApiKey(provider, fromSecret);
  }

  throw new Error(buildMissingKeyMessage(config));
}

function cacheApiKey(provider: ProviderId, value: string): string {
  API_KEY_CACHE.set(provider, value);
  return value;
}

function readKeyFile(path: string, envVars: string[]): string | null {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    const name = match[1];
    if (!name || !envVars.includes(name)) continue;
    let value = match[2]!.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (value) return value;
  }
  return null;
}

function readSecret(name: string): string | null {
  const result = spawnSync("secret", ["get", name], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) return null;
  const value = result.stdout.trim();
  return value || null;
}

function buildMissingKeyMessage(config: ProviderSecretConfig): string {
  const envList = config.envVars.map(envVar => `process.env.${envVar}`).join(", ");
  const keyFiles = config.keyFiles.map(path => `  - ${path}`).join("\n");
  const secretLine = config.secretName ? `\n  - secret get ${config.secretName}` : "";

  return `missionwriter: ${config.displayName} API key not set.

Looked in:
  - ${envList}
${keyFiles}${secretLine}

Set one of ${config.envVars.join(" / ")} in the environment, add it to ${PROVIDERS_KEY_FILE}, or make it available through the secret command.`;
}
