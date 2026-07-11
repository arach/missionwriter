import type { ReactNode } from "react";
import { cx } from "../lib/site";

/*
 * A faithful `review-rewrite` mission, matching the schema documented in the
 * README (shape / workdir / writer / contributors / inputs / outputs / budget)
 * and the brief style of examples/ops-control-minimap.mission.md. Every field
 * and value here is real product surface — no invented options.
 */
const MISSION = `---
shape: review-rewrite
workdir: ./content/blog
writer:
  provider: eve                # the pi coding agent
  model: openai-codex/gpt-5.5
contributors:                  # review voices, gathered first
  - id: grok-strategist
    provider: xai
    role: strategic-review
  - id: opus-reviewer
    provider: agent-sessions
    role: engineering-docs-review
inputs:
  - shell-chrome.md
outputs:
  - draft.md
  - reviews.md
budget:
  tokens: 80000
  toolCalls: 30
---

Brief: Run a strategic + engineering-docs review of the input,
consolidate the findings into reviews.md, then produce a tightened
v2 in draft.md — cut every line two reviewers flag, and end on a
concrete sentence, not an abstract flourish.`;

function splitComment(s: string): { main: string; comment?: string } {
  const i = s.indexOf(" #");
  if (i === -1) return { main: s };
  return { main: s.slice(0, i), comment: s.slice(i + 1) };
}

/** Render "key: value" (or a bare scalar) into token spans. */
function renderInner(content: string, keyIndex: number): ReactNode {
  const kv = content.match(/^([A-Za-z0-9_-]+):(\s*)(.*)$/);
  if (kv) {
    const key = kv[1];
    let rest = kv[3];
    let comment: string | undefined;
    let main = "";
    if (rest.startsWith("#")) {
      comment = rest;
    } else {
      const parts = splitComment(rest);
      main = parts.main.trimEnd();
      comment = parts.comment;
    }
    return (
      <>
        <span className="text-foreground/85">{key}</span>
        <span className="text-muted-foreground/45">:</span>
        {main ? <span className="text-muted-foreground"> {main}</span> : null}
        {comment ? (
          <span className="ml-2 text-muted-foreground/40 italic">{comment}</span>
        ) : null}
      </>
    );
  }
  const { main, comment } = splitComment(content);
  return (
    <>
      <span className="text-muted-foreground">{main}</span>
      {comment ? (
        <span className="ml-2 text-muted-foreground/40 italic">{comment}</span>
      ) : null}
    </>
  );
}

function renderLine(line: string, closingIdx: number, index: number): ReactNode {
  if (line === "") return " ";

  const isFence = line.trim() === "---";
  const inFrontmatter = index > 0 && index < closingIdx;

  if (isFence) {
    return <span className="text-muted-foreground/40">{line}</span>;
  }

  if (inFrontmatter) {
    const list = line.match(/^(\s*)- (.*)$/);
    if (list) {
      return (
        <>
          <span>{list[1]}</span>
          <span className="text-primary/70">- </span>
          {renderInner(list[2], index)}
        </>
      );
    }
    const kv = line.match(/^(\s*)(.*)$/);
    const indent = kv?.[1] ?? "";
    const rest = kv?.[2] ?? line;
    return (
      <>
        <span>{indent}</span>
        {renderInner(rest, index)}
      </>
    );
  }

  // Brief / body prose.
  if (line.startsWith("Brief:")) {
    return (
      <>
        <span className="font-semibold text-foreground">Brief:</span>
        <span className="text-muted-foreground/85">{line.slice(6)}</span>
      </>
    );
  }
  return <span className="text-muted-foreground/85">{line}</span>;
}

export function MissionFile({ filename = "blog-review.mission.md" }: { filename?: string }) {
  const lines = MISSION.split("\n");
  const closingIdx = lines.findIndex((l, i) => i > 0 && l.trim() === "---");

  return (
    <figure className="m-0 overflow-hidden rounded-[6px] border bg-card/50 mw-hairline shadow-[0_1px_0_oklch(var(--foreground)/0.04)]">
      {/* Editor chrome */}
      <figcaption className="flex items-center gap-3 border-b mw-hairline bg-background/40 px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/25" />
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/25" />
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/25" />
        </span>
        <span className="mw-code text-[0.78rem] text-muted-foreground">{filename}</span>
        <span className="ml-auto rounded-[3px] border mw-hairline px-1.5 py-0.5 text-[0.62rem] font-medium uppercase tracking-[0.12em] text-primary/80">
          mission
        </span>
      </figcaption>

      {/* Source with a line-number gutter */}
      <div className="mw-scroll overflow-x-auto">
        <pre className="mw-code m-0 min-w-max whitespace-pre px-0 py-3">
          {lines.map((line, i) => (
            <div key={i} className="flex px-1">
              <span
                aria-hidden
                className="w-9 select-none pr-3 text-right text-muted-foreground/25 tabular-nums"
              >
                {i + 1}
              </span>
              <code className="whitespace-pre">{renderLine(line, closingIdx, i)}</code>
            </div>
          ))}
        </pre>
      </div>
    </figure>
  );
}
