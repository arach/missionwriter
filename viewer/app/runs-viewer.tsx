"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Frame, NavigationBar, SidePanel, StatusBar } from "hudsonkit/chrome";
import {
  AlertTriangle,
  FileText,
  GitCompareArrows,
  History,
  Moon,
  RefreshCw,
  Sun,
} from "lucide-react";
import type { RunView } from "@/src/runs-data";
import { basename, editorialTitle, formatAbsolute, humanDuration, relativeTime } from "@/src/format";
import { DocumentSurface } from "./components/DocumentSurface";
import { THEME_STORAGE_KEY } from "./theme-key";

/** A run has a captured document when any declared output produced bytes. */
function runHasDocument(run: RunView): boolean {
  return run.outputs?.some((o) => o.bytesAfter != null) ?? false;
}
/** A run is worth opening when it has a document to show OR a session to render. */
function runHasContent(run: RunView): boolean {
  return run.hasSession || runHasDocument(run);
}

/* ── layout constants (mirror HudsonKit SHELL_THEME.layout) ──────────────── */
const NAV_H = 48;
const STATUS_H = 28;
const PANEL_W = 288;

type Status = RunView["status"];

const STATUS_META: Record<
  Status,
  {
    label: string;
    dot: string;
    text: string;
    softBg: string;
    ring: string;
    barColor: "emerald" | "amber" | "red" | "neutral";
  }
> = {
  finished: {
    label: "finished",
    dot: "bg-success",
    text: "text-success",
    softBg: "bg-success/10",
    ring: "border-success/30",
    barColor: "emerald",
  },
  running: {
    label: "running",
    dot: "bg-warning",
    text: "text-warning",
    softBg: "bg-warning/10",
    ring: "border-warning/30",
    barColor: "amber",
  },
  failed: {
    label: "failed",
    dot: "bg-destructive",
    text: "text-destructive",
    softBg: "bg-destructive/10",
    ring: "border-destructive/30",
    barColor: "red",
  },
};

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ── small presentational pieces ─────────────────────────────────────────── */

function StatusDot({ status }: { status: Status }) {
  const m = STATUS_META[status];
  return (
    <span className="relative inline-flex h-2 w-2 shrink-0">
      {status === "running" && (
        <span className={cx("absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping", m.dot)} />
      )}
      <span className={cx("relative inline-flex h-2 w-2 rounded-full", m.dot)} />
    </span>
  );
}

/* Status reads through the colored StatusDot + kicker — no filled pill (editorial restraint). */

function WriterModel({ writer, model, size = "sm" }: { writer: string; model: string; size?: "sm" | "md" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-[2px] border border-border/70 bg-background/40 font-mono tabular-nums whitespace-nowrap",
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-[12px]",
      )}
    >
      <span className="text-foreground/85">{writer}</span>
      <span className="text-muted-foreground/50">/</span>
      <span className="text-muted-foreground">{model || "default"}</span>
    </span>
  );
}

/* ── run list row ────────────────────────────────────────────────────────── */

function RunRow({
  run,
  selected,
  now,
  onSelect,
}: {
  run: RunView;
  selected: boolean;
  now: number;
  onSelect: (id: string) => void;
}) {
  const selectable = runHasContent(run);
  const hasDoc = runHasDocument(run);
  const hasDiff = run.outputs?.some((o) => o.hadBefore) ?? false;

  return (
    <button
      type="button"
      onClick={() => selectable && onSelect(run.id)}
      aria-current={selected ? "true" : undefined}
      aria-disabled={!selectable}
      title={selectable ? run.mission : "nothing captured for this run"}
      className={cx(
        "group relative block w-full border-b px-3.5 py-3 text-left transition-colors",
        "border-[color:var(--hud-chrome-border-subtle)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset",
        selected
          ? "bg-foreground/[0.055]"
          : selectable
            ? "hover:bg-foreground/[0.03] cursor-pointer"
            : "opacity-45 cursor-default",
      )}
    >
      <span
        className={cx(
          "absolute left-0 top-0 bottom-0 w-[2px] bg-accent transition-opacity",
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-40",
        )}
      />

      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <StatusDot status={run.status} />
          <span className="truncate text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground/70">
            {run.shape}
          </span>
        </div>
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/80">
          {relativeTime(run.startedAt, now)}
        </span>
      </div>

      <h3 className="mt-1.5 truncate font-editorial text-[15px] font-medium leading-snug text-foreground">
        {editorialTitle(run.mission)}
      </h3>

      <div className="mt-2 flex items-center justify-between gap-2">
        <WriterModel writer={run.writer} model={run.model} />
        <div className="flex shrink-0 items-center gap-1.5">
          {hasDoc && (
            <span
              className="inline-flex items-center gap-0.5 text-muted-foreground/70"
              title={hasDiff ? "document with before→after diff" : "captured document"}
            >
              <FileText size={11} className="opacity-80" />
              {hasDiff && <GitCompareArrows size={11} className="opacity-70" />}
            </span>
          )}
          {selectable ? (
            <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground/80">
              {humanDuration(run.durationMs)}
            </span>
          ) : (
            <span className="rounded-[2px] bg-muted/40 px-1 py-px font-mono text-[9px] uppercase tracking-wide text-muted-foreground/70">
              empty
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

/* ── metadata header (main content) ──────────────────────────────────────── */

function MetaField({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <dt className="text-[9.5px] font-medium uppercase tracking-[0.16em] text-muted-foreground/60">{label}</dt>
      <dd className={cx("min-w-0 break-words text-[13px] text-foreground", mono && "font-mono tabular-nums text-[12px]")}>
        {children}
      </dd>
    </div>
  );
}

function MetadataHeader({ run, now }: { run: RunView; now: number }) {
  return (
    <header className="shrink-0 rounded-[3px] border border-border/70 bg-card/30 px-8 py-7">
      <div className="flex items-center gap-2.5 text-[10px] font-medium uppercase tracking-[0.2em]">
        <StatusDot status={run.status} />
        <span className="text-muted-foreground">{run.shape}</span>
        <span className="text-muted-foreground/30">·</span>
        <span className="text-muted-foreground/60">{relativeTime(run.startedAt, now)}</span>
      </div>

      <h1 className="mt-3.5 font-editorial text-[30px] font-medium leading-[1.08] tracking-[-0.01em] text-foreground">
        {editorialTitle(run.mission)}
      </h1>

      <p className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-muted-foreground">
        <span className="font-editorial text-[14px] italic text-foreground/80">by {run.writer}</span>
        <span className="text-muted-foreground/30">·</span>
        <span className="font-mono text-[11px] tabular-nums">{run.model || "default"}</span>
        <span className="text-muted-foreground/30">·</span>
        <span className="font-mono text-[11px] tabular-nums">
          {run.startedAt ? formatAbsolute(run.startedAt) : "—"}
        </span>
        <span className="text-muted-foreground/30">·</span>
        <span className="font-mono text-[11px] tabular-nums">{humanDuration(run.durationMs)}</span>
      </p>

      {run.status === "failed" && (
        <div className="mt-5 rounded-[3px] border border-destructive/25 bg-destructive/[0.06] p-3.5">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-destructive">
            <AlertTriangle size={13} />
            Failed
          </div>
          <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-destructive/90">
            {run.error || "run ended in a failed state"}
          </pre>
        </div>
      )}

      <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-5 border-t border-[color:var(--hud-chrome-border-subtle)] pt-6 md:grid-cols-3">
        <MetaField label="Mission">
          <span title={run.mission}>{basename(run.mission) || "—"}</span>
        </MetaField>
        <MetaField label="Shape">
          <span className="inline-flex items-center rounded-[2px] border border-border/70 bg-background/40 px-2 py-0.5 font-mono text-[12px] text-foreground/90">
            {run.shape}
          </span>
        </MetaField>
        <MetaField label="Writer / model">
          <WriterModel writer={run.writer} model={run.model} size="md" />
        </MetaField>
        <MetaField label="Started" mono>
          {run.startedAt ? formatAbsolute(run.startedAt) : "—"}
        </MetaField>
        <MetaField label="Duration" mono>
          {humanDuration(run.durationMs)}
        </MetaField>
        {run.endedAt ? (
          <MetaField label="Ended" mono>
            {formatAbsolute(run.endedAt)}
          </MetaField>
        ) : null}
        {run.workdir ? (
          <MetaField label="Workdir">
            <span title={run.workdir}>{basename(run.workdir) || "—"}</span>
          </MetaField>
        ) : null}
        <MetaField label="Run ID" mono>
          <span className="text-muted-foreground">{run.id}</span>
        </MetaField>
      </dl>
    </header>
  );
}

/* ── empty / loading states ──────────────────────────────────────────────── */

function CenteredState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="max-w-[46ch] rounded-[3px] border border-dashed border-border/60 bg-card/20 px-10 py-14 text-center">
        {children}
      </div>
    </div>
  );
}

/* ── theme toggle ────────────────────────────────────────────────────────── */

function useTheme(): [string, () => void] {
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    const current = document.documentElement.dataset.hudsonTheme || "dark";
    setTheme(current);
  }, []);

  const toggle = useCallback(() => {
    const next = (document.documentElement.dataset.hudsonTheme || "dark") === "dark" ? "light" : "dark";
    document.documentElement.dataset.hudsonTheme = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ theme: next, template: "hudson" }));
    } catch {
      /* ignore */
    }
    setTheme(next);
  }, []);

  return [theme, toggle];
}

/* ── main viewer ─────────────────────────────────────────────────────────── */

export default function RunsViewer() {
  const searchParams = useSearchParams();

  const [runs, setRuns] = useState<RunView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get("run"));
  const [now, setNow] = useState(() => Date.now());
  const [theme, toggleTheme] = useTheme();

  /* poll the run index (cheap json reads) */
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/runs", { cache: "no-store" });
      if (!res.ok) throw new Error(`GET /api/runs → ${res.status}`);
      setRuns((await res.json()) as RunView[]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 4000);
    return () => clearInterval(t);
  }, [load]);

  /* keep relative timestamps fresh */
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const selectRun = useCallback((id: string) => {
    setSelectedId(id);
    const u = new URL(window.location.href);
    u.searchParams.set("run", id);
    window.history.replaceState(null, "", u);
  }, []);

  /* auto-select the newest run with a transcript once loaded */
  useEffect(() => {
    if (!runs || runs.length === 0) return;
    const exists = selectedId && runs.some((r) => r.id === selectedId);
    if (exists) return;
    const firstSelectable = runs.find(runHasContent);
    if (firstSelectable) selectRun(firstSelectable.id);
  }, [runs, selectedId, selectRun]);

  const filtered = useMemo(() => {
    if (!runs) return [];
    const q = search.trim().toLowerCase();
    if (!q) return runs;
    return runs.filter((r) =>
      [r.shape, r.mission, r.writer, r.model, r.id].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [runs, search]);

  const selected = useMemo(
    () => (runs && selectedId ? runs.find((r) => r.id === selectedId) ?? null : null),
    [runs, selectedId],
  );

  const counts = useMemo(() => {
    const c = { total: 0, finished: 0, running: 0, failed: 0, withSession: 0, withDoc: 0 };
    for (const r of runs ?? []) {
      c.total++;
      c[r.status]++;
      if (r.hasSession) c.withSession++;
      if (runHasDocument(r)) c.withDoc++;
    }
    return c;
  }, [runs]);

  const statusBarStatus = selected
    ? { label: STATUS_META[selected.status].label.toUpperCase(), color: STATUS_META[selected.status].barColor }
    : ({ label: runs && runs.length ? "READY" : "IDLE", color: "neutral" } as const);

  /* ── HUD chrome ─────────────────────────────────────────────────────────── */

  const hud = (
    <>
      <NavigationBar
        title="missionwriter"
        subtitle="runs · serve"
        search={{ value: search, onChange: setSearch, placeholder: "Filter runs…" }}
        actions={
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void load()}
              aria-label="Refresh runs"
              title="Refresh"
              className="flex h-7 w-7 items-center justify-center rounded-[2px] border border-border/70 text-muted-foreground transition-colors hover:border-ring/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <RefreshCw size={13} />
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle color theme"
              title={theme === "dark" ? "Switch to light" : "Switch to dark"}
              className="flex h-7 w-7 items-center justify-center rounded-[2px] border border-border/70 text-muted-foreground transition-colors hover:border-ring/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
            </button>
          </div>
        }
      />

      <SidePanel
        side="left"
        title="Runs"
        icon={<History size={12} />}
        width={PANEL_W}
        footer={
          <div className="border-t border-[color:var(--hud-chrome-border-subtle)] px-3.5 py-2.5 font-mono text-[10px] text-muted-foreground">
            {counts.total} {counts.total === 1 ? "run" : "runs"}
            <span className="text-muted-foreground/40"> · </span>
            {counts.withDoc} with a document
          </div>
        }
      >
        {runs === null ? (
          <div className="px-3.5 py-6 font-mono text-[11px] text-muted-foreground">Loading runs…</div>
        ) : filtered.length === 0 ? (
          <div className="px-3.5 py-6 font-mono text-[11px] text-muted-foreground">
            {runs.length === 0 ? "no runs yet" : "no runs match filter"}
          </div>
        ) : (
          <div className="flex flex-col">
            {filtered.map((r) => (
              <RunRow
                key={r.id}
                run={r}
                now={now}
                selected={selectedId === r.id}
                onSelect={selectRun}
              />
            ))}
          </div>
        )}
      </SidePanel>

      <StatusBar
        status={statusBarStatus}
        left={
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {selected ? (
              <>
                <span className="text-foreground/85">{selected.shape}</span>
                <span className="text-muted-foreground/40"> · </span>
                {selected.id}
              </>
            ) : (
              <>
                {counts.total} {counts.total === 1 ? "run" : "runs"}
                {counts.failed > 0 && <span className="text-destructive"> · {counts.failed} failed</span>}
              </>
            )}
          </span>
        }
        right={
          selected ? (
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {selected.writer}/{selected.model || "default"}
            </span>
          ) : undefined
        }
      />
    </>
  );

  /* ── main content ───────────────────────────────────────────────────────── */

  let content: React.ReactNode;
  if (error && runs === null) {
    content = (
      <CenteredState>
        <AlertTriangle size={26} className="mx-auto text-destructive" />
        <h2 className="mt-3 font-editorial text-[18px] font-medium text-foreground">Could not load runs</h2>
        <p className="mt-1.5 font-mono text-[12px] text-muted-foreground">{error}</p>
      </CenteredState>
    );
  } else if (runs === null) {
    content = (
      <CenteredState>
        <History size={26} className="mx-auto animate-pulse text-muted-foreground/60" />
        <p className="mt-3 font-mono text-[12px] text-muted-foreground">Loading runs…</p>
      </CenteredState>
    );
  } else if (runs.length === 0) {
    content = (
      <CenteredState>
        <History size={26} className="mx-auto text-muted-foreground/50" />
        <h2 className="mt-3 font-editorial text-[20px] font-medium text-foreground">No runs yet</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          Hand a mission to Eve with{" "}
          <code className="rounded-[2px] bg-muted/50 px-1.5 py-0.5 font-mono text-[12px] text-foreground">
            mw run &lt;mission.md&gt;
          </code>
          . Each run is recorded under{" "}
          <code className="rounded-[2px] bg-muted/50 px-1.5 py-0.5 font-mono text-[12px] text-foreground">.runs/</code>{" "}
          and shows up here.
        </p>
      </CenteredState>
    );
  } else if (!selected) {
    content = (
      <CenteredState>
        <FileText size={26} className="mx-auto text-muted-foreground/60" />
        <h2 className="mt-3 font-editorial text-[18px] font-medium text-foreground">Select a run</h2>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          Pick a run from the left to read the document it wrote.
        </p>
      </CenteredState>
    );
  } else {
    content = (
      <div className="flex h-full flex-col gap-4 p-6 pr-8">
        <MetadataHeader run={selected} now={now} />
        <DocumentSurface key={selected.id} run={selected} />
      </div>
    );
  }

  return (
    <Frame mode="panel" hud={hud} panOffset={{ x: 0, y: 0 }} scale={1} showZoomControls={false}>
      <div
        className="box-border h-screen w-full"
        style={{ paddingTop: NAV_H, paddingBottom: STATUS_H, paddingLeft: PANEL_W }}
      >
        <div className="mw-scroll h-full w-full overflow-auto">{content}</div>
      </div>
    </Frame>
  );
}
