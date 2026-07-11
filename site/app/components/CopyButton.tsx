"use client";

import { Check, Copy } from "lucide-react";
import { useCallback, useState } from "react";
import { cx } from "../lib/site";

/**
 * Copy-to-clipboard control for command chips. Client-only (needs
 * navigator.clipboard + local state); everything else stays a server component.
 */
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(() => {
    void navigator.clipboard?.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }, [value]);

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={copied ? "Copied" : label}
      className={cx(
        "inline-flex h-7 w-7 items-center justify-center rounded-[3px] border transition-colors",
        "mw-hairline text-muted-foreground hover:text-foreground hover:bg-muted/50",
        "focus:outline-none focus-visible:ring-1 focus-visible:ring-ring",
      )}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-primary" aria-hidden />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden />
      )}
    </button>
  );
}
