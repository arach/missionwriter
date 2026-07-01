"use client";

import { useMemo } from "react";
import { GitCompareArrows } from "lucide-react";
import { diffLines, type DiffRow } from "@/src/line-diff";

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Clean line-level before→after diff: hairline green/red, monospace, no bubbles. */
export function LineDiffView({
  before,
  after,
  title,
}: {
  before: string;
  after: string;
  title?: string;
}) {
  const diff = useMemo(() => diffLines(before, after), [before, after]);

  if (diff.identical) {
    return (
      <div className="flex min-h-[160px] items-center justify-center rounded-[3px] border border-dashed border-border/60 bg-card/20 p-8 text-center">
        <p className="text-[13px] text-muted-foreground">
          The text is unchanged — the run left <span className="font-editorial italic text-foreground/80">{title}</span> byte-for-byte identical.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-[3px] border border-border/70 bg-card/20">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-[color:var(--hud-chrome-border-subtle)] px-3">
        <GitCompareArrows size={12} className="text-muted-foreground/60" />
        <span className="text-[11px] font-medium text-foreground/80">before → after</span>
        <span className="flex-1" />
        <span className="inline-flex items-center gap-2 font-mono text-[10.5px] tabular-nums">
          <span className="text-emerald-400/85">+{diff.stats.added}</span>
          <span className="text-red-400/85">−{diff.stats.removed}</span>
        </span>
      </div>
      <div className="mw-scroll min-h-0 flex-1 overflow-auto py-1.5">
        <div className="font-mono text-[12px] leading-[1.55]">
          {diff.rows.map((row, i) => (
            <DiffLine key={i} row={row} />
          ))}
        </div>
      </div>
    </div>
  );
}

function DiffLine({ row }: { row: DiffRow }) {
  const isAdd = row.type === "add";
  const isDel = row.type === "del";
  return (
    <div
      className={cx(
        "flex items-stretch border-l-2",
        isAdd && "border-emerald-500/55 bg-emerald-500/[0.06]",
        isDel && "border-red-500/55 bg-red-500/[0.06]",
        row.type === "same" && "border-transparent",
      )}
    >
      <span className="w-9 shrink-0 select-none px-1.5 text-right text-[10px] tabular-nums text-muted-foreground/40">
        {row.beforeNo ?? ""}
      </span>
      <span className="w-9 shrink-0 select-none px-1.5 text-right text-[10px] tabular-nums text-muted-foreground/40">
        {row.afterNo ?? ""}
      </span>
      <span
        className={cx(
          "w-4 shrink-0 select-none text-center",
          isAdd && "text-emerald-400/80",
          isDel && "text-red-400/80",
          row.type === "same" && "text-muted-foreground/25",
        )}
      >
        {isAdd ? "+" : isDel ? "−" : " "}
      </span>
      <span
        className={cx(
          "min-w-0 flex-1 whitespace-pre-wrap break-words pr-3",
          row.type === "same" ? "text-foreground/55" : "text-foreground/90",
        )}
      >
        {row.text || " "}
      </span>
    </div>
  );
}
