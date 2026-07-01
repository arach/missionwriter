import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
  copyFileSync,
  statSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

import type { MissionSpec, ProviderId } from "./mission.js";

const PI_BIN = process.env.PI_BIN ?? "pi";

/**
 * missionwriter's thin "layer above": one directory per `mw run` under `.runs/`,
 * holding a small run.json and — for the Eve writer — pi's own session transcript
 * (via `--session-dir`). The deep view is Eve's: `mw show` renders that session to
 * HTML with `pi --export`. We don't reimplement transcript visualization.
 */
/**
 * The actual text a run touched. missionwriter's editorial mandate is the
 * document, not the transcript — so we snapshot each declared output into the
 * run dir: `before__<name>` (if it existed at start → a diff is available) and
 * `after__<name>` (the produced text). Workdirs are often ephemeral (temp
 * dirs), so capturing at run time is the only durable record.
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
  writer: ProviderId;
  model: string;
  workdir: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  status: "running" | "finished" | "failed";
  error?: string;
  /** captured output documents (the text), snapshotted before/after under artifacts/ */
  outputs?: RunArtifact[];
}

export interface RunHandle {
  dir: string;
  finish(status: "finished" | "failed", error?: string): void;
}

function runsRoot(): string {
  return join(process.cwd(), ".runs");
}

export function startRun(spec: MissionSpec, writer: ProviderId, model: string): RunHandle {
  const startedAt = new Date();
  const id = `${startedAt.toISOString().replace(/[:.]/g, "-")}__${spec.shape}`;
  const dir = join(runsRoot(), id);
  mkdirSync(dir, { recursive: true });

  // Snapshot the "before" state of each declared output (the text as it stood
  // when the run started), so a rewrite/edit can be shown as a diff.
  const artifactsDir = join(dir, "artifacts");
  const outputs: RunArtifact[] = [];
  if (spec.outputs?.length) {
    mkdirSync(artifactsDir, { recursive: true });
    for (const rel of spec.outputs) {
      const name = basename(rel);
      const abs = resolve(spec.workdir, rel);
      let hadBefore = false;
      if (existsSync(abs)) {
        try {
          copyFileSync(abs, join(artifactsDir, `before__${name}`));
          hadBefore = true;
        } catch {
          /* unreadable — skip the before snapshot */
        }
      }
      outputs.push({ name, rel, hadBefore, bytesAfter: null });
    }
  }

  const meta: RunMeta = {
    id,
    mission: spec.source,
    shape: spec.shape,
    writer,
    model,
    workdir: spec.workdir,
    startedAt: startedAt.toISOString(),
    status: "running",
    ...(outputs.length ? { outputs } : {}),
  };
  writeMeta(dir, meta);

  return {
    dir,
    finish(status, error) {
      meta.status = status;
      const endedAt = new Date();
      meta.endedAt = endedAt.toISOString();
      meta.durationMs = endedAt.getTime() - startedAt.getTime();
      if (error) meta.error = error;
      // Snapshot the produced text (the "after") for each declared output.
      for (const o of outputs) {
        const abs = resolve(spec.workdir, o.rel);
        if (existsSync(abs)) {
          try {
            copyFileSync(abs, join(artifactsDir, `after__${o.name}`));
            o.bytesAfter = statSync(abs).size;
          } catch {
            o.bytesAfter = null;
          }
        }
      }
      writeMeta(dir, meta);
    },
  };
}

function writeMeta(dir: string, meta: RunMeta): void {
  writeFileSync(join(dir, "run.json"), `${JSON.stringify(meta, null, 2)}\n`);
}

export function listRuns(): RunMeta[] {
  const root = runsRoot();
  if (!existsSync(root)) return [];
  const runs: RunMeta[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const metaPath = join(root, entry.name, "run.json");
    if (!existsSync(metaPath)) continue;
    try {
      runs.push(JSON.parse(readFileSync(metaPath, "utf8")) as RunMeta);
    } catch {
      /* skip malformed run.json */
    }
  }
  return runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/** `mw runs` — one line per run, newest first. */
export function printRuns(): void {
  const runs = listRuns();
  if (runs.length === 0) {
    console.error("no runs yet — `mw run <mission>` writes them under .runs/");
    return;
  }
  for (const r of runs) {
    const icon = r.status === "finished" ? "✓" : r.status === "failed" ? "✗" : "…";
    const dur = r.durationMs != null ? `${Math.round(r.durationMs / 1000)}s` : "—";
    console.log(`${icon}  ${r.id}  ${r.writer}/${r.model}  ${dur.padStart(5)}`);
  }
}

/** `mw show [id]` — render the run's Eve session to HTML via `pi --export` and open it. */
export function showRun(idHint?: string): void {
  const runs = listRuns();
  if (runs.length === 0) {
    console.error("no runs to show");
    return;
  }
  const run = idHint ? runs.find(r => r.id === idHint || r.id.includes(idHint)) : runs[0];
  if (!run) {
    console.error(`run not found: ${idHint}`);
    return;
  }

  const dir = join(runsRoot(), run.id);
  const jsonl = findSessionJsonl(dir);
  if (!jsonl) {
    console.error(`no Eve session captured for ${run.id} (writer=${run.writer}). run.json:\n`);
    console.log(readFileSync(join(dir, "run.json"), "utf8"));
    return;
  }

  const html = join(dir, "session.html");
  const exported = spawnSync(PI_BIN, ["--export", jsonl, html], { stdio: "inherit" });
  if (exported.status !== 0) {
    console.error("pi --export failed");
    return;
  }
  spawnSync("open", [html], { stdio: "inherit" });
  console.error(`opened ${html}`);
}

/**
 * `mw serve [port]` — launch the Next.js + HudsonKit runs viewer from `viewer/`.
 *
 * The dashboard lists runs via its own route handlers (`/api/runs`) and frames
 * Eve's `pi --export` transcript per run in an iframe. missionwriter provides
 * the index; Eve provides the deep view. We hand the viewer an explicit
 * `MW_RUNS_DIR` so it always resolves the repo's `.runs/` regardless of cwd.
 */
export function serveRuns(port = 4321): void {
  const here = dirname(fileURLToPath(import.meta.url)); // <repo>/src
  const repoRoot = join(here, "..");
  const viewerDir = join(repoRoot, "viewer");

  if (!existsSync(join(viewerDir, "package.json"))) {
    console.error(`mw serve: viewer app not found at ${viewerDir}`);
    console.error("run `cd viewer && bun install` first, then retry `mw serve`.");
    process.exit(1);
  }

  console.error(`missionwriter runs → http://localhost:${port}`);

  const child = spawn("bun", ["run", "dev", "--", "-p", String(port)], {
    cwd: viewerDir,
    stdio: "inherit",
    env: { ...process.env, MW_RUNS_DIR: join(repoRoot, ".runs") },
  });

  child.on("error", err => {
    console.error(`mw serve: failed to launch Next dev server — ${err.message}`);
    process.exit(1);
  });
  child.on("exit", code => process.exit(code ?? 0));
}

/** pi may nest the session under a project slug inside --session-dir; find the newest .jsonl. */
function findSessionJsonl(dir: string): string | null {
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
