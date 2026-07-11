"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, FilePenLine, FileText, GitCompareArrows, ScrollText } from "lucide-react";
import type { RunDocument, RunSession, RunView } from "@/src/runs-data";
import { Prose } from "./Prose";
import { LineDiffView } from "./LineDiffView";
import { Transcript } from "./Transcript";
import { LiveDocumentEditor } from "./LiveDocumentEditor";

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export type DocumentTab = "document" | "diff" | "live" | "transcript";

interface DocResponse {
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

    void (async () => {
      try {
        const res = await fetch(`/api/runs/${encodeURIComponent(run.id)}/document`, { cache: "no-store" });
        const data = (await res.json()) as DocResponse;
        if (!cancelled) setDoc(res.ok ? data : { outputs: [] });
      } catch {
        if (!cancelled) setDoc(null);
      }
    })();

    if (run.hasSession) {
      void (async () => {
        try {
          const res = await fetch(`/api/runs/${encodeURIComponent(run.id)}/session`, { cache: "no-store" });
          if (!cancelled) setSession(res.ok ? ((await res.json()) as RunSession) : null);
        } catch {
          if (!cancelled) setSession(null);
        }
      })();
    } else {
      setSession(null);
    }

    return () => {
      cancelled = true;
    };
  }, [initialTab, run.id, run.hasSession]);

  const loading = doc === undefined || (run.hasSession && session === undefined);

  const outputs = doc?.outputs ?? [];
  const current = outputs[Math.min(outputIdx, Math.max(0, outputs.length - 1))];
  const hasAnyDoc = outputs.some((o) => o.after != null);
  const docAvailable = current?.after != null;
  const diffAvailable =
    !!current && current.hadBefore && current.before != null && current.after != null && current.before !== current.after;

  const liveAvailable = !!current && /\.(md|mdx|markdown)$/i.test(current.rel) && current.after != null;
  const available: DocumentTab[] = [];
  if (hasAnyDoc) available.push("document");
  if (diffAvailable) available.push("diff");
  if (liveAvailable) available.push("live");
  if (run.hasSession && (session?.turns.length ?? 0) > 0) available.push("transcript");

  const defaultTab: DocumentTab = hasAnyDoc ? "document" : "transcript";
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
        <FileText size={26} className="text-muted-foreground/60" />
        <h2 className="mt-3 font-editorial text-[18px] font-medium text-foreground">Nothing captured for this run</h2>
        <p className="mt-1.5 max-w-[46ch] text-[12.5px] text-muted-foreground">
          This run declared no output document and has no Eve session to render. A{" "}
          <code className="rounded-[2px] bg-muted/50 px-1 font-mono text-[11px]">write</code> or{" "}
          <code className="rounded-[2px] bg-muted/50 px-1 font-mono text-[11px]">review-rewrite</code> mission
          produces a document here.
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
      {outputs.length > 1 && activeTab !== "transcript" && (
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
