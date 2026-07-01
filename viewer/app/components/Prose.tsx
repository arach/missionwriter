"use client";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/**
 * Editorial prose. Renders untrusted-ish local markdown safely — react-markdown
 * does NOT emit raw HTML by default (no rehype-raw), so file contents can never
 * inject markup. All typography lives in `.mw-prose` (globals.css): serif body,
 * generous measure, real vertical rhythm. `size="sm"` tightens it for the
 * supporting transcript narration.
 */
export function Prose({
  children,
  size = "md",
  className,
}: {
  children: string;
  size?: "md" | "sm";
  className?: string;
}) {
  return (
    <div className={cx("mw-prose font-editorial", size === "sm" && "mw-prose-sm", className)}>
      <Markdown remarkPlugins={[remarkGfm]}>{children}</Markdown>
    </div>
  );
}
