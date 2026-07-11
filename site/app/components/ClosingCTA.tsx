import { Github } from "lucide-react";
import { GITHUB_URL } from "../lib/site";
import { CommandBlock } from "./CommandBlock";
import { LinkButton } from "./LinkButton";

export function ClosingCTA() {
  return (
    <section id="get-started" className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 mw-grid-bg" />
      <div className="relative mx-auto max-w-3xl px-5 py-24 text-center sm:px-8 sm:py-32">
        <h2 className="mw-display text-balance text-[2.1rem] leading-[1.1] text-foreground sm:text-5xl">
          Start with a mission. End with a document
          <br className="hidden sm:block" /> <span className="italic">you can keep working on.</span>
        </h2>

        <div className="mx-auto mt-10 max-w-md text-left">
          <CommandBlock
            lines={[
              { cmd: "bun install" },
              { cmd: "mw run path/to/mission.md" },
              { cmd: "mw serve" },
            ]}
          />
        </div>

        <div className="mt-8 flex justify-center">
          <LinkButton href={GITHUB_URL} variant="secondary" external>
            <Github className="h-4 w-4" aria-hidden />
            View on GitHub
          </LinkButton>
        </div>
      </div>
    </section>
  );
}
