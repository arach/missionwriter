import type { ReactNode } from "react";
import { cx } from "../lib/site";

type Variant = "primary" | "secondary" | "ghost";

const base =
  "inline-flex items-center justify-center gap-2 rounded-[4px] text-sm font-medium " +
  "transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ring " +
  "h-10 px-4";

const variants: Record<Variant, string> = {
  primary:
    "bg-foreground text-background hover:bg-foreground/90",
  secondary:
    "border mw-hairline bg-transparent text-foreground hover:bg-muted/50",
  ghost: "text-muted-foreground hover:text-foreground",
};

export function LinkButton({
  href,
  children,
  variant = "secondary",
  external,
  className,
}: {
  href: string;
  children: ReactNode;
  variant?: Variant;
  external?: boolean;
  className?: string;
}) {
  const rel = external ? "noreferrer noopener" : undefined;
  const target = external ? "_blank" : undefined;
  return (
    <a href={href} rel={rel} target={target} className={cx(base, variants[variant], className)}>
      {children}
    </a>
  );
}
