"use client";

import { useMemo } from "react";
import {
  ChevronRight,
  FileText,
  List,
  MessageSquareQuote,
  Pencil,
  Search,
  Sparkles,
  Terminal,
  Wrench,
} from "lucide-react";
import type { RunSession } from "@/src/runs-data";
import { Prose } from "./Prose";

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function base(p: string): string {
  if (!p) return "";
  const parts = p.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1]! : p;
}

/* ── thread model (pairs each tool call with its result, in stream order) ───── */

type ThreadItem =
  | { key: string; kind: "brief"; text: string }
  | { key: string; kind: "assistant"; text: string }
  | { key: string; kind: "thinking"; text: string }
  | { key: string; kind: "tool"; name: string; args: Record<string, unknown>; result?: string };

function buildThread(session: RunSession): ThreadItem[] {
  const results: string[] = [];
  for (const turn of session.turns) {
    for (const b of turn.blocks) if (b.kind === "tool_result") results.push(b.text);
  }
  let ri = 0;
  const items: ThreadItem[] = [];
  session.turns.forEach((turn, ti) => {
    if (turn.role === "toolResult") return; // consumed as `results`
    turn.blocks.forEach((b, bi) => {
      const key = `${ti}-${bi}`;
      if (b.kind === "text") {
        const text = b.text.trim();
        if (!text) return;
        items.push({ key, kind: turn.role === "user" ? "brief" : "assistant", text });
      } else if (b.kind === "thinking") {
        items.push({ key, kind: "thinking", text: b.text });
      } else if (b.kind === "tool") {
        items.push({ key, kind: "tool", name: b.name, args: b.arguments, result: results[ri++] });
      }
    });
  });
  return items;
}

/* ── tool presentation ──────────────────────────────────────────────────────── */

function toolFace(name: string): { Icon: typeof Pencil; verb: string; tint: string } {
  const n = name.toLowerCase();
  if (n.includes("write") || n.includes("edit") || n.includes("create") || n.includes("apply"))
    return { Icon: Pencil, verb: name, tint: "text-emerald-400/80" };
  if (n.includes("read") || n.includes("cat") || n.includes("open"))
    return { Icon: FileText, verb: name, tint: "text-sky-400/75" };
  if (n.includes("list") || n === "ls" || n.includes("dir"))
    return { Icon: List, verb: name, tint: "text-muted-foreground/70" };
  if (n.includes("grep") || n.includes("search") || n.includes("glob") || n.includes("find"))
    return { Icon: Search, verb: name, tint: "text-amber-400/75" };
  if (n.includes("run") || n.includes("bash") || n.includes("exec") || n.includes("shell"))
    return { Icon: Terminal, verb: name, tint: "text-muted-foreground/70" };
  return { Icon: Wrench, verb: name, tint: "text-muted-foreground/70" };
}

function toolTarget(args: Record<string, unknown>): string {
  for (const k of ["path", "file", "filename", "file_path", "pattern", "query", "command", "cmd"]) {
    const v = args[k];
    if (typeof v === "string" && v) return v;
  }
  return "";
}

/* ── items ──────────────────────────────────────────────────────────────────── */

function Rail({ children, dot }: { children: React.ReactNode; dot: React.ReactNode }) {
  return (
    <div className="relative pl-8">
      <span className="absolute left-[9px] top-6 bottom-[-14px] w-px bg-[color:var(--hud-chrome-border-subtle)]" />
      <span className="absolute left-0 top-0.5 flex h-[19px] w-[19px] items-center justify-center rounded-full border border-border/70 bg-background">
        {dot}
      </span>
      {children}
    </div>
  );
}

function BriefItem({ text }: { text: string }) {
  const clean = text.replace(/^===\s*BRIEF\s*===\s*/i, "").trim();
  return (
    <Rail dot={<MessageSquareQuote size={11} className="text-muted-foreground/70" />}>
      <div className="text-[9.5px] font-medium uppercase tracking-[0.18em] text-muted-foreground/60">Brief</div>
      <div className="mt-2 rounded-[3px] border border-border/60 bg-card/30 px-4 py-3">
        <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground/80">{clean}</p>
      </div>
    </Rail>
  );
}

function ThinkingItem({ text }: { text: string }) {
  return (
    <Rail dot={<Sparkles size={10} className="text-muted-foreground/50" />}>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[9.5px] font-medium uppercase tracking-[0.18em] text-muted-foreground/55 transition-colors hover:text-muted-foreground/80">
          <ChevronRight size={11} className="transition-transform group-open:rotate-90" />
          Thinking
        </summary>
        <p className="mt-2 whitespace-pre-wrap break-words border-l border-border/50 pl-3 font-editorial text-[13px] italic leading-relaxed text-muted-foreground/75">
          {text.trim()}
        </p>
      </details>
    </Rail>
  );
}

function AssistantItem({ text }: { text: string }) {
  return (
    <Rail dot={<span className="h-1.5 w-1.5 rounded-full bg-accent" />}>
      <div className="text-[9.5px] font-medium uppercase tracking-[0.18em] text-muted-foreground/60">Writer</div>
      <div className="mt-2">
        <Prose size="sm">{text}</Prose>
      </div>
    </Rail>
  );
}

function ToolItem({ name, args, result }: { name: string; args: Record<string, unknown>; result?: string }) {
  const { Icon, verb, tint } = toolFace(name);
  const target = toolTarget(args);
  const content = typeof args.content === "string" ? args.content : null;

  return (
    <Rail dot={<Icon size={11} className={tint} />}>
      <div className="rounded-[3px] border border-border/70 bg-card/30">
        <div className="flex items-center gap-2 px-3 py-2">
          <span className={cx("font-mono text-[11.5px] font-medium", tint)}>{verb}</span>
          {target && (
            <>
              <span className="text-muted-foreground/30">·</span>
              <span className="truncate font-mono text-[11.5px] text-foreground/80" title={target}>
                {base(target)}
              </span>
            </>
          )}
        </div>
        {result && (
          <div className="border-t border-[color:var(--hud-chrome-border-subtle)] px-3 py-1.5">
            <p className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-muted-foreground/80">
              {result.length > 400 ? `${result.slice(0, 400)}…` : result}
            </p>
          </div>
        )}
        {content && (
          <details className="group border-t border-[color:var(--hud-chrome-border-subtle)]">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-1.5 font-mono text-[10.5px] text-muted-foreground/70 transition-colors hover:text-foreground/80">
              <ChevronRight size={11} className="transition-transform group-open:rotate-90" />
              view written text ({content.length.toLocaleString()} chars)
            </summary>
            <pre className="mw-scroll max-h-72 overflow-auto border-t border-[color:var(--hud-chrome-border-subtle)] bg-background/40 px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground/75">
              {content}
            </pre>
          </details>
        )}
      </div>
    </Rail>
  );
}

/* ── surface ────────────────────────────────────────────────────────────────── */

export function Transcript({ session }: { session: RunSession }) {
  const items = useMemo(() => buildThread(session), [session]);

  if (items.length === 0) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-[3px] border border-dashed border-border/60 bg-card/20 p-8 text-center">
        <p className="text-[13px] text-muted-foreground">This session has no renderable turns.</p>
      </div>
    );
  }

  return (
    <div className="rounded-[3px] border border-border/60 bg-card/20 px-6 py-6">
      {session.model && (
        <div className="mb-6 flex items-center gap-2 font-mono text-[10px] text-muted-foreground/70">
          <span className="rounded-[2px] border border-border/60 bg-background/40 px-1.5 py-0.5">{session.model}</span>
          {session.thinkingLevel && (
            <span className="rounded-[2px] border border-border/60 bg-background/40 px-1.5 py-0.5">
              thinking: {session.thinkingLevel}
            </span>
          )}
        </div>
      )}
      <div className="flex flex-col gap-6">
        {items.map((it) => {
          switch (it.kind) {
            case "brief":
              return <BriefItem key={it.key} text={it.text} />;
            case "thinking":
              return <ThinkingItem key={it.key} text={it.text} />;
            case "assistant":
              return <AssistantItem key={it.key} text={it.text} />;
            case "tool":
              return <ToolItem key={it.key} name={it.name} args={it.args} result={it.result} />;
          }
        })}
      </div>
    </div>
  );
}
