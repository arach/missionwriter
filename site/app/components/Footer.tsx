import { Github } from "lucide-react";
import { GITHUB_URL, README_URL } from "../lib/site";

export function Footer() {
  return (
    <footer className="border-t mw-hairline">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-10 sm:flex-row sm:items-center sm:px-8">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-foreground">missionwriter</span>
          <span className="text-muted-foreground/50">·</span>
          <span className="text-sm text-muted-foreground">
            agentic writing, review, and revision in Markdown
          </span>
        </div>
        <nav className="flex items-center gap-5 text-sm text-muted-foreground sm:ml-auto">
          <a
            href={README_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="transition-colors hover:text-foreground"
          >
            Docs
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
          >
            <Github className="h-4 w-4" aria-hidden />
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}
