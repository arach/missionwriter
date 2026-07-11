import { Github } from "lucide-react";
import { GITHUB_URL, README_URL } from "../lib/site";

export function TopBar() {
  return (
    <header className="sticky top-0 z-50 border-b mw-hairline bg-background/70 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-5 sm:px-8">
        <a href="#top" className="group flex items-center gap-2">
          <span
            aria-hidden
            className="flex h-6 w-6 items-center justify-center rounded-[4px] border mw-hairline bg-card font-mono text-[0.7rem] font-semibold text-primary"
          >
            mw
          </span>
          <span className="font-mono text-[0.9rem] tracking-tight text-foreground">
            missionwriter
          </span>
        </a>

        <nav className="ml-auto hidden items-center gap-6 text-sm text-muted-foreground sm:flex">
          <a href="#features" className="transition-colors hover:text-foreground">
            Features
          </a>
          <a href="#how-it-works" className="transition-colors hover:text-foreground">
            How it works
          </a>
          <a
            href={README_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="transition-colors hover:text-foreground"
          >
            Docs
          </a>
        </nav>

        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer noopener"
          aria-label="View missionwriter on GitHub"
          className="ml-auto inline-flex items-center gap-2 rounded-[4px] border mw-hairline px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted/50 sm:ml-0"
        >
          <Github className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">GitHub</span>
        </a>
      </div>
    </header>
  );
}
