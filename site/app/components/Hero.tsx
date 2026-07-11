import { ArrowRight, Github } from "lucide-react";
import { GITHUB_URL } from "../lib/site";
import { CommandBlock } from "./CommandBlock";
import { LinkButton } from "./LinkButton";

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 mw-grid-bg" />
      <div className="relative mx-auto max-w-3xl px-5 pb-16 pt-20 text-center sm:px-8 sm:pb-24 sm:pt-28">
        <p className="mw-kicker mb-6">An agentic Markdown workspace</p>

        <h1 className="mw-display text-balance text-[2.6rem] leading-[1.04] text-foreground sm:text-6xl">
          Give agents writing missions, then collaborate on the edits in Markdown.
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-[1.05rem] leading-relaxed text-muted-foreground sm:text-lg">
          Missionwriter turns a Markdown brief into a traceable writing run. Agents work against
          real files, people revise those files in a live editor, and every change comes back as a
          run you can read, compare, and continue.
        </p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <LinkButton href="#get-started" variant="primary" className="w-full sm:w-auto">
            Get started
            <ArrowRight className="h-4 w-4" aria-hidden />
          </LinkButton>
          <LinkButton href={GITHUB_URL} variant="secondary" external className="w-full sm:w-auto">
            <Github className="h-4 w-4" aria-hidden />
            View on GitHub
          </LinkButton>
        </div>

        <div className="mx-auto mt-10 max-w-md text-left">
          <CommandBlock
            lines={[
              { cmd: "bun install" },
              { cmd: "mw run path/to/mission.md" },
              { cmd: "mw serve" },
            ]}
          />
        </div>
      </div>
    </section>
  );
}
