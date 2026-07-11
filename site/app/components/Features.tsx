import { FileClock, GitCompareArrows, MessageSquareText, Workflow } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Feature = {
  icon: LucideIcon;
  title: string;
  body: React.ReactNode;
};

const FEATURES: Feature[] = [
  {
    icon: Workflow,
    title: "Missions are executable briefs",
    body: (
      <>
        Declare the workdir, inputs, outputs, writer, review voices, and job shape in one Markdown
        file. The brief stays readable and the run stays repeatable.
      </>
    ),
  },
  {
    icon: MessageSquareText,
    title: "Feedback stays attached to the text",
    body: (
      <>
        Select a passage in the live document and write the note beside it. Missionwriter sends the
        exact quote, offsets, and line range to the revision agent.
      </>
    ),
  },
  {
    icon: GitCompareArrows,
    title: "Revisions are ordinary runs",
    body: (
      <>
        Human edits and agent revisions share one Markdown file. Each agent turn records immutable
        before and after artifacts, its parent run, and a diff of what changed.
      </>
    ),
  },
  {
    icon: FileClock,
    title: "The history does not move",
    body: (
      <>
        The live file can keep changing while the original document, diff, transcript, writer, and
        model remain attached to the run that produced them.
      </>
    ),
  },
];

export function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
      <div className="mb-12 max-w-2xl">
        <p className="mw-kicker mb-3">What it can do</p>
        <h2 className="mw-display text-3xl text-foreground sm:text-[2.5rem] sm:leading-[1.1]">
          Built for documents that pass between people and agents.
        </h2>
      </div>

      <div className="grid gap-px overflow-hidden rounded-[6px] border mw-hairline bg-border/40 sm:grid-cols-2">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <div key={title} className="bg-background p-6 sm:p-8">
            <span className="mb-5 inline-flex h-9 w-9 items-center justify-center rounded-[5px] border mw-hairline bg-card text-primary">
              <Icon className="h-[18px] w-[18px]" aria-hidden strokeWidth={1.75} />
            </span>
            <h3 className="mb-2.5 font-editorial text-xl text-foreground">{title}</h3>
            <p className="text-[0.95rem] leading-relaxed text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
