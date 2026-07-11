import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Read-only mirror of the run helpers in `missionwriter/src/runs.ts`. The CLI
 * writers own `RunMeta`, `startRun`, `listRuns`, `findSessionJsonl`; here we
 * only READ `.runs/`, so duplicating ~40 lines avoids cross-package import
 * friction (and keeps this a pure server module).
 */

/**
 * A captured output document. missionwriter snapshots the text each run touched
 * into `artifacts/before__<name>` / `after__<name>` so the *document* — not the
 * transcript — is the durable record. Mirror of `RunArtifact` in
 * `missionwriter/src/runs.ts`.
 */
export interface RunArtifact {
  /** file name (basename of the declared output), e.g. "website-outline.md" */
  name: string;
  /** path as declared in the mission's `outputs`, relative to the workdir */
  rel: string;
  /** the file already existed when the run started → a before→after diff exists */
  hadBefore: boolean;
  /** size of the produced file in bytes, or null if nothing was produced there */
  bytesAfter: number | null;
}

export interface RunMeta {
  id: string;
  mission: string;
  shape: string;
  writer: string;
  model: string;
  workdir: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  status: "running" | "finished" | "failed";
  error?: string;
  origin?: {
    kind: "editor";
    parentRunId: string;
    outputIndex: number;
    outputRel: string;
  };
  /** captured output documents (the text), snapshotted before/after under artifacts/ */
  outputs?: RunArtifact[];
}

/** RunMeta plus whether an Eve `pi` transcript was captured for the run. */
export type RunView = RunMeta & { hasSession: boolean };

/** A run's captured document(s), with the actual before/after text resolved. */
export interface RunDocument {
  name: string;
  rel: string;
  hadBefore: boolean;
  /** the produced text, or null if nothing could be resolved */
  after: string | null;
  /** the pre-run text (only when `hadBefore`), or null */
  before: string | null;
}

/* ── session (native transcript) types ─────────────────────────────────────── */

export type SessionBlock =
  | { kind: "text"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "tool"; name: string; arguments: Record<string, unknown> }
  | { kind: "tool_result"; text: string };

export interface SessionTurn {
  role: "user" | "assistant" | "toolResult" | string;
  timestamp?: string;
  blocks: SessionBlock[];
}

export interface RunSession {
  cwd?: string;
  /** newest model seen in `model_change` records (`provider/modelId`) */
  model?: string;
  /** newest thinking level seen in `thinking_level_change` records */
  thinkingLevel?: string;
  turns: SessionTurn[];
}

/**
 * Resolve the `.runs/` directory robustly:
 *   1. `MW_RUNS_DIR` env (set by `mw serve` — always correct).
 *   2. The nearest ancestor of cwd that contains a `.runs/` dir (handles
 *      `next dev` running from `viewer/` as well as from the repo root).
 *   3. Fallback to `<parent-of-cwd>/.runs`.
 */
export function runsRoot(): string {
  const env = process.env.MW_RUNS_DIR;
  if (env) return env;

  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, ".runs");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return join(dirname(/* turbopackIgnore: true */ process.cwd()), ".runs");
}

/** pi may nest the session under a project slug inside the run dir; newest .jsonl wins. */
export function findSessionJsonl(dir: string): string | null {
  const found: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith(".jsonl")) found.push(p);
    }
  };
  try {
    walk(dir);
  } catch {
    return null;
  }
  return found.sort().pop() ?? null;
}

export function readRunMeta(id: string): RunMeta | null {
  if (!isSafeRunId(id)) return null;
  const p = join(runsRoot(), id, "run.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as RunMeta;
  } catch {
    return null;
  }
}

/** Newest-first, mirroring `listRuns()`, annotated with `hasSession`. */
export function listRunViews(): RunView[] {
  const root = runsRoot();
  if (!existsSync(root)) return [];
  const runs: RunView[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(root, entry.name);
    const metaPath = join(dir, "run.json");
    if (!existsSync(metaPath)) continue;
    try {
      const meta = JSON.parse(readFileSync(metaPath, "utf8")) as RunMeta;
      runs.push({ ...meta, hasSession: findSessionJsonl(dir) != null });
    } catch {
      /* skip malformed run.json */
    }
  }
  return runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function readRunView(id: string): RunView | null {
  const meta = readRunMeta(id);
  if (!meta) return null;
  return { ...meta, hasSession: findSessionJsonl(join(runsRoot(), id)) != null };
}

/* Guard rail — captured docs are editorial prose (KBs); never read a runaway. */
const MAX_TEXT_BYTES = 4 * 1024 * 1024;

function readTextFile(p: string): string | null {
  try {
    if (!existsSync(p)) return null;
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

/**
 * Resolve each declared output to its actual before/after text.
 *   after:  artifacts/after__<name> → live file at join(workdir, rel) → null
 *   before: artifacts/before__<name> (only when hadBefore) → null
 */
export function readRunDocuments(id: string): RunDocument[] {
  const meta = readRunMeta(id);
  if (!meta) return [];
  const dir = join(runsRoot(), id);
  const artifactsDir = join(dir, "artifacts");

  return (meta.outputs ?? []).map((o) => {
    const afterArtifact = join(artifactsDir, `after__${o.name}`);
    let after = readTextFile(afterArtifact);
    if (after == null && o.rel) {
      // Older runs (pre-artifacts) — fall back to the live file in the workdir.
      after = readTextFile(join(meta.workdir, o.rel));
    }
    const before = o.hadBefore ? readTextFile(join(artifactsDir, `before__${o.name}`)) : null;
    return {
      name: o.name,
      rel: o.rel,
      hadBefore: o.hadBefore,
      after: after != null && after.length <= MAX_TEXT_BYTES ? after : after != null ? after.slice(0, MAX_TEXT_BYTES) : null,
      before: before != null && before.length <= MAX_TEXT_BYTES ? before : before != null ? before.slice(0, MAX_TEXT_BYTES) : null,
    };
  });
}

/* ── native session parsing (replaces `pi --export`) ───────────────────────── */

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function normalizeMessage(msg: unknown, fallbackTs?: string): SessionTurn | null {
  if (!msg || typeof msg !== "object") return null;
  const m = msg as { role?: unknown; content?: unknown; timestamp?: unknown };
  const role = typeof m.role === "string" ? m.role : "assistant";
  const content = Array.isArray(m.content) ? m.content : [];
  const blocks: SessionBlock[] = [];

  for (const raw of content) {
    if (!raw || typeof raw !== "object") continue;
    const b = raw as Record<string, unknown>;
    switch (b.type) {
      case "text": {
        const text = asString(b.text);
        if (role === "toolResult") blocks.push({ kind: "tool_result", text });
        else blocks.push({ kind: "text", text });
        break;
      }
      case "thinking": {
        const text = asString(b.thinking);
        if (text.trim()) blocks.push({ kind: "thinking", text });
        break;
      }
      case "toolCall": {
        const args = b.arguments && typeof b.arguments === "object" ? (b.arguments as Record<string, unknown>) : {};
        blocks.push({ kind: "tool", name: asString(b.name) || "tool", arguments: args });
        break;
      }
      default:
        break; // robust to unknown block types
    }
  }

  if (blocks.length === 0) return null;
  const timestamp = asString(m.timestamp) || fallbackTs;
  return timestamp ? { role, timestamp, blocks } : { role, blocks };
}

/** Parse the newest `.jsonl` in the run dir into an ordered, normalized session. */
export function readRunSession(id: string): RunSession | null {
  if (!isSafeRunId(id)) return null;
  const dir = join(runsRoot(), id);
  const jsonl = findSessionJsonl(dir);
  if (!jsonl) return null;

  let raw: string;
  try {
    raw = readFileSync(jsonl, "utf8");
  } catch {
    return null;
  }

  const session: RunSession = { turns: [] };
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let rec: Record<string, unknown>;
    try {
      rec = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue; // skip malformed lines
    }
    switch (rec.type) {
      case "session":
        session.cwd = asString(rec.cwd) || session.cwd;
        break;
      case "model_change": {
        const provider = asString(rec.provider);
        const modelId = asString(rec.modelId);
        session.model = modelId ? (provider ? `${provider}/${modelId}` : modelId) : provider || session.model;
        break;
      }
      case "thinking_level_change":
        session.thinkingLevel = asString(rec.thinkingLevel) || session.thinkingLevel;
        break;
      case "message": {
        const turn = normalizeMessage(rec.message, asString(rec.timestamp));
        if (turn) session.turns.push(turn);
        break;
      }
      default:
        break;
    }
  }
  return session;
}

function isSafeRunId(id: string): boolean {
  return id.length > 0 && id !== "." && id !== ".." && !id.includes("/") && !id.includes("\\");
}
