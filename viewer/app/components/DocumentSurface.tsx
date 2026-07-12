"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, FilePenLine, FileText, GitCompareArrows, MessageSquareQuote, ScrollText } from "lucide-react";
import { viewerApiPaths } from "@/src/api-paths";
import type { RunDocument, RunSession, RunView } from "@/src/runs-data";
import { Prose } from "./Prose";
import { LineDiffView } from "./LineDiffView";
import { Transcript } from "./Transcript";
import { LiveDocumentEditor } from "./LiveDocumentEditor";

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export type DocumentTab = "brief" | "document" | "diff" | "live" | "transcript";

interface DocResponse {
  brief: string | null;
  outputs: RunDocument[];
}

/**
 * The primary surface — the document is the star. Renders the produced text as
 * editorial prose (default), a before→after diff when a "before" existed, and
 * the native Eve transcript as the supporting "how it was made" view.
 */
export function DocumentSurface({
  run,
  initialTab,
  onRevisionComplete,
}: {
  run: RunView;
  initialTab?: DocumentTab;
  onRevisionComplete: (runId: string) => void;
}) {
  const [doc, setDoc] = useState<DocResponse | null | undefined>(undefined);
  const [session, setSession] = useState<RunSession | null | undefined>(undefined);
  const [userTab, setUserTab] = useState<DocumentTab | null>(initialTab ?? null);
  const [outputIdx, setOutputIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setDoc(undefined);
    setSession(undefined);
    setUserTab(initialTab ?? null);
    setOutputIdx(0);

    const loadDocument = async () => {
      try {
        const res = await fetch(viewerApiPaths.runDocument(run.id), { cache: "no-store" });
        const data = (await res.json()) as DocResponse;
        if (!cancelled) setDoc(res.ok ? data : { brief: null, outputs: [] });
      } catch {
        if (!cancelled) setDoc(null);
      }
    };

    const loadSession = async () => {
      try {
        const res = await fetch(viewerApiPaths.runSession(run.id), { cache: "no-store" });
        if (!cancelled) setSession(res.ok ? ((await res.json()) as RunSession) : null);
      } catch {
        if (!cancelled) setSession(null);
      }
    };

    void Promise.all([loadDocument(), loadSession()]);
    const timer = run.status === "running"
      ? window.setInterval(() => void Promise.all([loadDocument(), loadSession()]), 2_000)
      : null;

    return () => {
      cancelled = true;
      if (timer != null) window.clearInterval(timer);
    };
  }, [initialTab, run.id, run.status]);

  const loading = doc === undefined || session === undefined;

  const brief = doc?.brief ?? null;
  const outputs = doc?.outputs ?? [];
  const current = outputs[Math.min(outputIdx, Math.max(0, outputs.length - 1))];
  const hasAnyDoc = outputs.some((o) => o.after != null);
  const docAvailable = current?.after != null;
  const diffAvailable =
    !!current && current.hadBefore && current.before != null && current.after != null && current.before !== current.after;

  const liveAvailable = !!current && /\.(md|mdx|markdown)$/i.test(current.rel) && current.after != null;
  const available: DocumentTab[] = [];
  if (brief) available.push("brief");
  if (hasAnyDoc) available.push("document");
  if (diffAvailable) available.push("diff");
  if (liveAvailable) available.push("live");
  if ((session?.turns.length ?? 0) > 0) available.push("transcript");

  const defaultTab: DocumentTab = run.status === "running" && brief
    ? "brief"
    : hasAnyDoc
      ? "document"
      : brief
        ? "brief"
        : "transcript";
  const activeTab: DocumentTab | undefined =
    userTab && available.includes(userTab) ? userTab : available.includes(defaultTab) ? defaultTab : available[0];

  if (loading) {
    return (
      <section className="flex min-h-[240px] flex-1 items-center justify-center rounded-[3px] border border-border/60 bg-card/20">
        <p className="animate-pulse font-mono text-[12px] text-muted-foreground">Loading document…</p>
      </section>
    );
  }

  if (available.length === 0) {
    return (
      <section className="flex min-h-[240px] flex-1 flex-col items-center justify-center rounded-[3px] border border-dashed border-border/60 bg-card/20 p-10 text-center">
        <FileText size={26} className={run.status === "running" ? "animate-pulse text-warning/70" : "text-muted-foreground/60"} />
        <h2 className="mt-3 font-editorial text-[18px] font-medium text-foreground">
          {run.status === "running" ? "Run is starting" : "Nothing captured for this run"}
        </h2>
        <p className="mt-1.5 max-w-[46ch] text-[12.5px] text-muted-foreground">
          {run.status === "running" ? (
            "The brief, agent activity, and emerging document will appear here as they become available."
          ) : (
            <>
              This run declared no output document and has no Eve session to render. A{" "}
              <code className="rounded-[2px] bg-muted/50 px-1 font-mono text-[11px]">write</code> or{" "}
              <code className="rounded-[2px] bg-muted/50 px-1 font-mono text-[11px]">review-rewrite</code> mission
              produces a document here.
            </>
          )}
        </p>
      </section>
    );
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      {/* tab strip */}
      <div className="flex shrink-0 items-end justify-between gap-3 border-b border-[color:var(--hud-chrome-border-subtle)]">
        <div className="flex items-end gap-0.5">
          <TabButton
            active={activeTab === "brief"}
            show={available.includes("brief")}
            onClick={() => setUserTab("brief")}
            icon={<MessageSquareQuote size={13} />}
            label="Brief"
          />
          <TabButton
            active={activeTab === "document"}
            show={available.includes("document")}
            onClick={() => setUserTab("document")}
            icon={<FileText size={13} />}
            label="Document"
          />
          <TabButton
            active={activeTab === "diff"}
            show={available.includes("diff")}
            onClick={() => setUserTab("diff")}
            icon={<GitCompareArrows size={13} />}
            label="Diff"
          />
          <TabButton
            active={activeTab === "live"}
            show={available.includes("live")}
            onClick={() => setUserTab("live")}
            icon={<FilePenLine size={13} />}
            label="Live editor"
          />
          <TabButton
            active={activeTab === "transcript"}
            show={available.includes("transcript")}
            onClick={() => setUserTab("transcript")}
            icon={<ScrollText size={13} />}
            label="Transcript"
            muted
          />
        </div>
        {current && (activeTab === "document" || activeTab === "diff" || activeTab === "live") && (
          <div className="flex items-center gap-2 pb-1.5 pr-1 font-mono text-[10px] tabular-nums text-muted-foreground/70">
            <span className="text-foreground/70">{current.name}</span>
            {current.after != null && <span>· {current.after.length.toLocaleString()} chars</span>}
            {liveAvailable && activeTab !== "live" && (
              <button type="button" onClick={() => setUserTab("live")} className="ml-1 rounded border border-border/70 px-2 py-0.5 text-foreground hover:border-ring/50">
                Open live document
              </button>
            )}
          </div>
        )}
      </div>

      {/* output selector (only when a run produced multiple documents) */}
      {outputs.length > 1 && activeTab !== "brief" && activeTab !== "transcript" && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-[color:var(--hud-chrome-border-subtle)] px-1 py-2">
          {outputs.map((o, i) => (
            <button
              key={o.name}
              type="button"
              onClick={() => setOutputIdx(i)}
              className={cx(
                "rounded-[2px] border px-2 py-0.5 font-mono text-[10.5px] transition-colors",
                i === outputIdx
                  ? "border-ring/50 bg-foreground/[0.06] text-foreground"
                  : "border-border/60 text-muted-foreground hover:border-ring/40 hover:text-foreground/85",
              )}
            >
              {o.name}
            </button>
          ))}
        </div>
      )}

      {/* body */}
      <div className="mw-scroll min-h-0 flex-1 overflow-auto pt-5">
        {activeTab === "brief" && brief && (
          <article className="rounded-[3px] border border-border/60 bg-card/20 px-6 py-9 sm:px-12">
            <div className="mx-auto max-w-[70ch]">
              <div className="mb-7 flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--hud-chrome-border-subtle)] pb-4">
                <span className="text-[9.5px] font-medium uppercase tracking-[0.18em] text-muted-foreground/65">
                  Original brief
                </span>
                <span className="font-mono text-[10px] text-muted-foreground/60">
                  Captured at start · immutable
                </span>
              </div>
              <Prose>{brief}</Prose>
            </div>
          </article>
        )}

        {activeTab === "document" && current?.after != null && (
          <article className="rounded-[3px] border border-border/60 bg-card/20 px-6 py-9 sm:px-12">
            <div className="mx-auto max-w-[70ch]">
              <Prose>{current.after}</Prose>
            </div>
          </article>
        )}

        {activeTab === "diff" && current?.before != null && current?.after != null && (
          <div className="flex min-h-0 flex-1">
            <LineDiffView before={current.before} after={current.after} title={current.name} />
          </div>
        )}

        {liveAvailable && current && (
          <div className={activeTab === "live" ? "block" : "hidden"}>
            <LiveDocumentEditor
              key={`${run.id}:${outputIdx}`}
              run={run}
              outputIndex={outputIdx}
              onRevisionComplete={onRevisionComplete}
            />
          </div>
        )}

        {activeTab === "transcript" &&
          (session && session.turns.length > 0 ? (
            <Transcript session={session} />
          ) : (
            <div className="flex min-h-[200px] items-center justify-center rounded-[3px] border border-dashed border-border/60 bg-card/20 p-8 text-center">
              <div>
                <AlertTriangle size={22} className="mx-auto text-muted-foreground/50" />
                <p className="mt-2 text-[13px] text-muted-foreground">No Eve session captured for this run.</p>
              </div>
            </div>
          ))}
      </div>
    </section>
  );
}

function TabButton({
  active,
  show,
  onClick,
  icon,
  label,
  muted,
}: {
  active: boolean;
  show: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  muted?: boolean;
}) {
  if (!show) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cx(
        "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[12.5px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset",
        active
          ? "border-accent font-medium text-foreground"
          : cx(
              "border-transparent hover:text-foreground",
              muted ? "text-muted-foreground/70" : "text-muted-foreground",
            ),
      )}
    >
      <span className={cx(active ? "text-accent" : "opacity-70")}>{icon}</span>
      {label}
    </button>
  );
}
