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

/**
 * `mw serve [port]` — a tiny local viewer for `.runs/`. The index lists runs;
 * each run links to Eve's own transcript, rendered on demand with `pi --export`.
 * missionwriter provides the index; Eve provides the deep view.
 */
export function serveRuns(port = 4321): void {
  Bun.serve({
    port,
    fetch(req) {
      const url = new URL(req.url);
      const rawMatch = url.pathname.match(/^\/runs\/([^/]+)\/html$/);
      if (rawMatch) return runHtml(decodeURIComponent(rawMatch[1]!));
      const viewMatch = url.pathname.match(/^\/runs\/([^/]+)$/);
      if (viewMatch) return runView(decodeURIComponent(viewMatch[1]!));
      if (url.pathname === "/") return html(indexPage());
      return new Response("not found", { status: 404 });
    },
  });
  console.error(`missionwriter runs → http://localhost:${port}`);
}

function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

const PAGE_CSS = `
  :root { color-scheme: dark }
  body { background:#0d1117; color:#c9d1d9; font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; margin:0 }
  header { padding:16px 24px; border-bottom:1px solid #21262d; display:flex; gap:12px; align-items:baseline }
  h1 { font-size:15px; margin:0; color:#e6edf3 } a { color:#58a6ff; text-decoration:none } a:hover { text-decoration:underline }
  main { padding:12px 24px } table { border-collapse:collapse; width:100% }
  td,th { text-align:left; padding:8px 14px 8px 0; border-bottom:1px solid #161b22; white-space:nowrap }
  th { color:#8b949e; font-weight:normal; font-size:12px }
  .ok{color:#3fb950} .fail{color:#f85149} .run{color:#d29922} .muted{color:#6e7681}
  iframe { width:100%; height:calc(100vh - 54px); border:0; background:#fff }
`;

function indexPage(): string {
  const runs = listRuns();
  const rows = runs.map(r => {
    const icon = r.status === "finished" ? '<span class="ok">✓</span>'
      : r.status === "failed" ? '<span class="fail">✗</span>' : '<span class="run">…</span>';
    const dur = r.durationMs != null ? `${Math.round(r.durationMs / 1000)}s` : "—";
    const hasSession = findSessionJsonl(join(runsRoot(), r.id)) != null;
    const cell = hasSession
      ? `<a href="/runs/${encodeURIComponent(r.id)}">${esc(r.id)}</a>`
      : `<span class="muted">${esc(r.id)}</span>`;
    return `<tr><td>${icon}</td><td>${cell}</td><td>${esc(r.shape)}</td><td class="muted">${esc(r.writer)}/${esc(r.model)}</td><td class="muted">${dur}</td></tr>`;
  }).join("");
  const body = runs.length
    ? `<table><thead><tr><th></th><th>run</th><th>shape</th><th>writer</th><th>dur</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<p class="muted">no runs yet — <code>mw run &lt;mission&gt;</code> writes them under .runs/</p>`;
  return `<!doctype html><meta charset=utf-8><title>missionwriter runs</title><style>${PAGE_CSS}</style>` +
    `<header><h1>missionwriter</h1><span class="muted">runs</span></header><main>${body}</main>`;
}

function runView(id: string): Response {
  const dir = join(runsRoot(), id);
  if (!findSessionJsonl(dir)) return html(`<p>no Eve session for ${esc(id)}</p>`, 404);
  return html(`<!doctype html><meta charset=utf-8><title>${esc(id)}</title><style>${PAGE_CSS}</style>` +
    `<header><a href="/">← runs</a><span class="muted">${esc(id)}</span></header>` +
    `<iframe src="/runs/${encodeURIComponent(id)}/html"></iframe>`);
}

function runHtml(id: string): Response {
  const dir = join(runsRoot(), id);
  const jsonl = findSessionJsonl(dir);
  if (!jsonl) return html("no session", 404);
  const out = join(dir, "session.html");
  const exported = spawnSync(PI_BIN, ["--export", jsonl, out], { stdio: "ignore" });
  if (exported.status !== 0 || !existsSync(out)) return html("pi --export failed", 500);
  return new Response(readFileSync(out), { headers: { "content-type": "text/html; charset=utf-8" } });
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
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
