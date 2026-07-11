import { ArrowDown, Bot, FileText } from "lucide-react";
import { cx } from "../lib/site";
import { MissionFile } from "./MissionFile";

function FileChip({ name, tone = "muted" }: { name: string; tone?: "muted" | "accent" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-[3px] border px-2 py-1 font-mono text-[0.72rem]",
        tone === "accent"
          ? "border-primary/25 bg-primary/5 text-foreground"
          : "mw-hairline bg-card/60 text-muted-foreground",
      )}
    >
      <FileText className="h-3 w-3 opacity-70" aria-hidden />
      {name}
    </span>
  );
}

function FlowNode({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[5px] border mw-hairline bg-card/40 px-4 py-3.5">
      <p className="mw-kicker mb-2 !text-[0.62rem]">{label}</p>
      <p className="mb-2.5 text-sm font-medium text-foreground">{title}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Connector() {
  return (
    <div className="flex flex-col items-center py-1.5" aria-hidden>
      <span className="h-3 w-px bg-border/70" />
      <ArrowDown className="h-3.5 w-3.5 text-muted-foreground/50" />
      <span className="h-3 w-px bg-border/70" />
    </div>
  );
}

export function MissionShowcase() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
      <div className="mb-10 max-w-2xl">
        <p className="mw-kicker mb-3">The mission file is the contract</p>
        <h2 className="mw-display text-3xl text-foreground sm:text-[2.5rem] sm:leading-[1.1]">
          One file makes the work explicit.
        </h2>
        <p className="mt-4 text-[1.02rem] leading-relaxed text-muted-foreground">
          Frontmatter sets the shape, workdir, writer, contributors, inputs, and outputs. The brief
          says what to do. The same mission can be inspected, rerun, and revised without rebuilding
          the prompt by hand.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr] lg:items-start lg:gap-8">
        <MissionFile />

        <div className="lg:pt-1">
          <FlowNode label="Reads" title="Declared inputs">
            <FileChip name="shell-chrome.md" />
          </FlowNode>
          <Connector />
          <FlowNode label="Runs" title="Writer agent, scoped to the workdir">
            <span className="inline-flex items-center gap-2 rounded-[3px] border border-primary/25 bg-primary/5 px-2.5 py-1.5 text-[0.78rem] text-foreground">
              <Bot className="h-3.5 w-3.5 text-primary" aria-hidden />
              <span className="font-mono">eve</span>
              <span className="text-muted-foreground/60">·</span>
              <span className="text-muted-foreground">pi coding agent</span>
            </span>
          </FlowNode>
          <Connector />
          <FlowNode label="Writes" title="Named outputs, back in the workdir">
            <FileChip name="draft.md" tone="accent" />
            <FileChip name="reviews.md" tone="accent" />
          </FlowNode>
        </div>
      </div>
    </section>
  );
}
