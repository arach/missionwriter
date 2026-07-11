import { Bot, FileText, GitCompareArrows, MessageSquarePlus, Save } from "lucide-react";

const runs = [
  { label: "Website outline", status: "finished", active: true },
  { label: "Voice settings review", status: "finished", active: false },
  { label: "Launch narrative", status: "finished", active: false },
];

export function LiveWorkspaceShowcase() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
      <div className="mb-10 max-w-2xl">
        <p className="mw-kicker mb-3">The live workspace</p>
        <h2 className="mw-display text-3xl text-foreground sm:text-[2.5rem] sm:leading-[1.1]">
          The run ends. The document keeps moving.
        </h2>
        <p className="mt-4 text-[1.02rem] leading-relaxed text-muted-foreground">
          Open any declared Markdown output, edit the file directly, and give the writer feedback
          on an exact passage. The next revision becomes a linked run with its own diff.
        </p>
      </div>

      <div className="overflow-hidden rounded-[7px] border bg-background mw-hairline shadow-[0_24px_80px_oklch(var(--foreground)/0.08)]">
        <div className="flex h-11 items-center border-b px-3 mw-hairline bg-card/55">
          <span className="font-mono text-[0.7rem] tracking-[0.14em] text-muted-foreground">
            MISSIONWRITER
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-[4px] border border-primary/25 bg-primary/5 px-2.5 py-1 font-mono text-[0.68rem] text-primary">
            <Bot className="h-3 w-3" aria-hidden /> Ask MW
          </span>
        </div>

        <div className="grid min-h-[390px] md:grid-cols-[190px_minmax(0,1fr)_260px]">
          <aside className="hidden border-r bg-card/25 p-2.5 mw-hairline md:block">
            <p className="mb-2 px-2 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-muted-foreground">
              Runs
            </p>
            {runs.map((run) => (
              <div
                key={run.label}
                className={`mb-1 rounded-[4px] border px-2.5 py-2 ${
                  run.active
                    ? "border-primary/25 bg-primary/5"
                    : "border-transparent text-muted-foreground"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${run.active ? "bg-primary" : "bg-muted-foreground/30"}`} />
                  <span className="truncate text-[0.76rem] text-foreground/85">{run.label}</span>
                </div>
                <p className="mt-1 pl-3 font-mono text-[0.58rem] uppercase tracking-wider text-muted-foreground/65">
                  {run.status}
                </p>
              </div>
            ))}
          </aside>

          <div className="min-w-0 border-r mw-hairline">
            <div className="flex items-center gap-4 border-b px-4 py-2.5 mw-hairline">
              <span className="inline-flex items-center gap-1.5 text-[0.72rem] text-muted-foreground">
                <FileText className="h-3.5 w-3.5" aria-hidden /> Document
              </span>
              <span className="inline-flex items-center gap-1.5 text-[0.72rem] text-muted-foreground">
                <GitCompareArrows className="h-3.5 w-3.5" aria-hidden /> Diff
              </span>
              <span className="border-b border-primary pb-2.5 text-[0.72rem] text-foreground">
                Live editor
              </span>
            </div>

            <div className="border-b px-4 py-2.5 mw-hairline bg-card/25">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[0.7rem] text-foreground">website-outline.md</span>
                <span className="ml-auto text-primary/70"><Save className="h-3.5 w-3.5" aria-hidden /></span>
              </div>
            </div>

            <div className="mw-code px-4 py-5 text-[0.75rem] leading-7 text-muted-foreground">
              <p className="text-foreground"># Missionwriter</p>
              <p className="mt-3 text-foreground/90">## A document workspace for agents</p>
              <p className="mt-2">A mission declares the files, writer, and result.</p>
              <p>
                Every run leaves behind an immutable record and a{" "}
                <span className="rounded-[2px] bg-primary/15 px-1 py-0.5 text-foreground ring-1 ring-primary/25">
                  document people can keep editing
                </span>
                .
              </p>
              <p className="mt-4 text-foreground/90">## Revision without lost context</p>
              <p className="mt-2">Select a passage, explain what is wrong, and send the exact quote to the writer.</p>
            </div>
          </div>

          <aside className="flex flex-col bg-card/20">
            <div className="border-b px-4 py-3 mw-hairline">
              <p className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">Agent</p>
              <p className="mt-2 text-[0.78rem] text-foreground">website-outline.md</p>
              <p className="mt-1 font-mono text-[0.6rem] text-muted-foreground">eve / openai-codex</p>
            </div>

            <div className="p-4">
              <p className="flex items-center gap-1.5 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-muted-foreground">
                <MessageSquarePlus className="h-3 w-3" aria-hidden /> In-context note
              </p>
              <div className="mt-2 rounded-[4px] border border-primary/20 bg-primary/5 p-3">
                <p className="font-mono text-[0.6rem] text-primary">Line 6</p>
                <blockquote className="mt-2 border-l border-primary/30 pl-2 text-[0.7rem] leading-relaxed text-foreground/70">
                  document people can keep editing
                </blockquote>
                <p className="mt-3 text-[0.72rem] leading-relaxed text-foreground/90">
                  Make this concrete. Mention the live file and revision history.
                </p>
              </div>
            </div>

            <div className="mt-auto border-t p-3 mw-hairline">
              <div className="rounded-[6px] border bg-background/70 p-3 mw-hairline">
                <p className="text-[0.72rem] text-muted-foreground">Message MW...</p>
                <div className="mt-5 flex items-center justify-between">
                  <span className="font-mono text-[0.56rem] text-muted-foreground">1 context note</span>
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-[4px] border border-primary/25 bg-primary/10 text-primary">
                    <Bot className="h-3 w-3" aria-hidden />
                  </span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
