import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import type { MissionSpec, ProviderId } from "./mission.js";

const PI_BIN = process.env.PI_BIN ?? "pi";

/**
 * missionwriter's thin "layer above": one directory per `mw run` under `.runs/`,
 * holding a small run.json and — for the Eve writer — pi's own session transcript
 * (via `--session-dir`). The deep view is Eve's: `mw show` renders that session to
 * HTML with `pi --export`. We don't reimplement transcript visualization.
 */
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

  const meta: RunMeta = {
    id,
    mission: spec.source,
    shape: spec.shape,
    writer,
    model,
    workdir: spec.workdir,
    startedAt: startedAt.toISOString(),
    status: "running",
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
