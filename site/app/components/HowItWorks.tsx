import { cx } from "../lib/site";

type Step = {
  n: string;
  title: string;
  body: React.ReactNode;
  code: string;
};

const STEPS: Step[] = [
  {
    n: "01",
    title: "Write the mission",
    body: (
      <>
        A <span className="font-mono text-foreground/90">.mission.md</span> with frontmatter plus
        the brief — the shape, workdir, inputs, outputs, and writer.
      </>
    ),
    code: "web-copy.mission.md",
  },
  {
    n: "02",
    title: "Run the writer in the workdir",
    body: (
      <>
        <span className="font-mono text-foreground/90">mw run</span> starts the writer, scoped to
        the workdir, with the inputs and any contributor reports.
      </>
    ),
    code: "mw run web-copy.mission.md",
  },
  {
    n: "03",
    title: "Open the live document",
    body: (
      <>
        <span className="font-mono text-foreground/90">mw serve</span> opens the run, immutable diff,
        transcript, and real Markdown output in one workspace.
      </>
    ),
    code: "mw serve",
  },
  {
    n: "04",
    title: "Revise with exact context",
    body: (
      <>
        Edit directly or attach notes to selected text. The writer returns a linked revision run
        with its own before and after artifacts.
      </>
    ),
    code: "select → note → revise",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t mw-hairline bg-card/20">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <div className="mb-12 max-w-2xl">
          <p className="mw-kicker mb-3">How it works</p>
          <h2 className="mw-display text-3xl text-foreground sm:text-[2.5rem] sm:leading-[1.1]">
            Mission, document, revision, history.
          </h2>
        </div>

        <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          {STEPS.map((step, i) => (
            <li key={step.n} className="relative flex flex-col">
              {i < STEPS.length - 1 ? (
                <span
                  aria-hidden
                  className="absolute right-[-1.25rem] top-4 hidden h-px w-6 bg-border/60 lg:block"
                />
              ) : null}
              <span className="mb-4 font-mono text-sm text-primary/80">{step.n}</span>
              <h3 className="mb-2 font-editorial text-xl text-foreground">{step.title}</h3>
              <p className="mb-4 text-[0.95rem] leading-relaxed text-muted-foreground">
                {step.body}
              </p>
              <span
                className={cx(
                  "mt-auto inline-flex w-fit items-center gap-2 rounded-[4px] border mw-hairline",
                  "bg-background/60 px-2.5 py-1.5 font-mono text-[0.72rem] text-muted-foreground",
                )}
              >
                <span className="text-primary/60">›</span>
                {step.code}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
