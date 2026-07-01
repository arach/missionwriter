import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { parse as parseYaml } from "yaml";

export type MissionShape = "review" | "write" | "review-rewrite";
export type ProviderId = "eve" | "cursor" | "xai" | "openrouter" | "minimax" | "copilot-cli" | "agent-sessions";
export type ContributorWeight = "primary" | "secondary" | "fallback";
export type AgentSessionTransport = "direct" | "tmux";
export type TmuxMissionEndPolicy = "detach" | "kill" | "keep";

export interface TmuxSessionPolicy {
  idleTimeoutMs?: number;
  onMissionEnd?: TmuxMissionEndPolicy;
}

export interface ContributorSpec {
  id: string;
  provider: ProviderId;
  role: string;
  model?: string;
  transport?: AgentSessionTransport;
  tmux?: TmuxSessionPolicy;
  prompt?: string;
  weight?: ContributorWeight;
  enabled?: boolean;
}

export interface MissionWriterSpec {
  provider?: ProviderId;
  model?: string;
}

export interface MissionSpec {
  shape: MissionShape;
  brief: string;
  workdir: string;
  provider?: ProviderId;
  model?: string;
  writer?: MissionWriterSpec;
  contributors?: ContributorSpec[];
  tmux?: TmuxSessionPolicy;
  budget?: { tokens?: number; toolCalls?: number };
  inputs?: string[];
  outputs?: string[];
  source: string;
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
const PROVIDERS = new Set<ProviderId>(["eve", "cursor", "xai", "openrouter", "minimax", "copilot-cli", "agent-sessions"]);
const WEIGHTS = new Set<ContributorWeight>(["primary", "secondary", "fallback"]);

export function loadMission(path: string): MissionSpec {
  const absolute = resolve(path);
  const raw = readFileSync(absolute, "utf8");
  const match = raw.match(FRONTMATTER_RE);
  if (!match) {
    throw new Error(`mission file missing YAML frontmatter: ${absolute}`);
  }
  const fm = parseYaml(match[1]!) as Record<string, unknown>;
  const brief = (match[2] ?? "").trim();
  if (!brief) {
    throw new Error(`mission file has no body brief: ${absolute}`);
  }

  const shape = fm.shape as MissionShape | undefined;
  if (shape !== "review" && shape !== "write" && shape !== "review-rewrite") {
    throw new Error(`mission shape must be 'review' | 'write' | 'review-rewrite' (got ${String(shape)})`);
  }

  const workdir = typeof fm.workdir === "string"
    ? resolve(dirname(absolute), fm.workdir)
    : dirname(absolute);

  return {
    shape,
    brief,
    workdir,
    provider: parseOptionalProvider(fm.provider, "provider"),
    model: typeof fm.model === "string" ? fm.model : undefined,
    writer: parseWriter(fm.writer),
    contributors: parseContributors(fm.contributors),
    tmux: parseOptionalTmuxPolicy(fm.tmux, "tmux"),
    budget: (fm.budget as MissionSpec["budget"]) ?? undefined,
    inputs: Array.isArray(fm.inputs) ? fm.inputs.map(String) : undefined,
    outputs: Array.isArray(fm.outputs) ? fm.outputs.map(String) : undefined,
    source: absolute,
  };
}

function parseWriter(value: unknown): MissionWriterSpec | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("mission writer must be an object when provided");
  }
  const raw = value as Record<string, unknown>;
  const provider = parseOptionalProvider(raw.provider, "writer.provider");
  const model = typeof raw.model === "string" ? raw.model : undefined;
  return provider || model ? { provider, model } : undefined;
}

function parseContributors(value: unknown): ContributorSpec[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw new Error("mission contributors must be a list when provided");
  }

  return value.map((item, index) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error(`mission contributors[${index}] must be an object`);
    }
    const raw = item as Record<string, unknown>;
    const id = requireString(raw.id, `contributors[${index}].id`);
    const provider = parseRequiredProvider(raw.provider, `contributors[${index}].provider`);
    const role = requireString(raw.role, `contributors[${index}].role`);
    const model = typeof raw.model === "string" ? raw.model : undefined;
    const transport = parseOptionalAgentSessionTransport(raw.transport, `contributors[${index}].transport`);
    const tmux = parseOptionalTmuxPolicy(raw.tmux, `contributors[${index}].tmux`);
    const prompt = typeof raw.prompt === "string" ? raw.prompt : undefined;
    const weight = parseOptionalWeight(raw.weight, `contributors[${index}].weight`);
    const enabled = typeof raw.enabled === "boolean" ? raw.enabled : undefined;

    return { id, provider, role, model, transport, tmux, prompt, weight, enabled };
  });
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`mission ${field} must be a non-empty string`);
  }
  return value;
}

function parseRequiredProvider(value: unknown, field: string): ProviderId {
  const provider = parseOptionalProvider(value, field);
  if (!provider) {
    throw new Error(`mission ${field} must be one of: ${Array.from(PROVIDERS).join(", ")}`);
  }
  return provider;
}

function parseOptionalProvider(value: unknown, field: string): ProviderId | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !PROVIDERS.has(value as ProviderId)) {
    throw new Error(`mission ${field} must be one of: ${Array.from(PROVIDERS).join(", ")}`);
  }
  return value as ProviderId;
}

function parseOptionalAgentSessionTransport(
  value: unknown,
  field: string,
): AgentSessionTransport | undefined {
  if (value === undefined || value === null) return undefined;
  if (value !== "direct" && value !== "tmux") {
    throw new Error(`mission ${field} must be 'direct' | 'tmux'`);
  }
  return value;
}

function parseOptionalTmuxPolicy(value: unknown, field: string): TmuxSessionPolicy | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`mission ${field} must be an object when provided`);
  }

  const raw = value as Record<string, unknown>;
  const idleTimeoutMs = typeof raw.idleTimeoutMs === "number" && Number.isFinite(raw.idleTimeoutMs)
    ? raw.idleTimeoutMs
    : undefined;
  const onMissionEnd = parseOptionalTmuxMissionEnd(raw.onMissionEnd, `${field}.onMissionEnd`);

  return idleTimeoutMs !== undefined || onMissionEnd !== undefined
    ? { idleTimeoutMs, onMissionEnd }
    : undefined;
}

function parseOptionalTmuxMissionEnd(
  value: unknown,
  field: string,
): TmuxMissionEndPolicy | undefined {
  if (value === undefined || value === null) return undefined;
  if (value !== "detach" && value !== "kill" && value !== "keep") {
    throw new Error(`mission ${field} must be 'detach' | 'kill' | 'keep'`);
  }
  return value;
}

function parseOptionalWeight(value: unknown, field: string): ContributorWeight | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !WEIGHTS.has(value as ContributorWeight)) {
    throw new Error(`mission ${field} must be one of: ${Array.from(WEIGHTS).join(", ")}`);
  }
  return value as ContributorWeight;
}
