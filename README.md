# missionwriter

Missionwriter is an agentic Markdown workspace for writing, review, and revision.

It gives coding agents a clear document contract: the brief, workdir, inputs, outputs, writer, and review contributors live in a Markdown mission file. Every run is captured. The resulting document can then be opened in a HudsonKit editor where people and agents revise the same file with exact, selection-level feedback.

[Open the landing page](https://arach.github.io/missionwriter/) · [Read the mission format](#mission-file-format)

```bash
bun install
bun link
mw run examples/ops-control-minimap.mission.md
mw serve
```

## What Missionwriter does

Missionwriter has three connected surfaces:

- Mission files declare repeatable writing work in Markdown.
- The runtime coordinates the writer, optional review contributors, file access, and run capture.
- `mw serve` is a live document workspace for reading diffs, editing Markdown, and asking the original writer to revise with anchored context.

The Markdown file on disk is the shared source of truth. Missionwriter does not hide it behind a proprietary document model, and historical run artifacts stay immutable.

```text
mission.md ──▶ Missionwriter core ──▶ writer + contributors ──▶ Markdown in the workdir
                        │                                          ▲
                        └── immutable runs, transcripts, diffs      │
                                                                   │
                                  human edits + anchored notes ─────┘
```

## The live document workflow

Run `mw serve` and open a declared Markdown output from any captured run.

The Document and Diff tabs show the immutable run artifacts. The Live editor opens the real output file in the run's workdir. From there you can:

- edit and preview Markdown through HudsonKit's CodeMirror-backed document surface;
- save atomically with revision hashes and visible dirty, saving, and conflict states;
- select exact text and attach one or more in-context notes;
- ask the original writer and model to revise the document;
- inspect the revision as a normal Missionwriter run with before/after artifacts and a parent origin.

The agent pane is on demand. Opening it yields the run list instead of turning the workspace into a permanent three-column IDE.

## Quick start

Missionwriter uses Bun.

```bash
bun install
bun link          # optional: puts `mw` on your PATH
```

The default writer is Eve, backed by the [`pi`](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) coding-agent harness. Install `pi` and configure its providers in `~/.pi/agent/`:

```bash
npm install -g @earendil-works/pi-coding-agent
```

Then run a mission:

```bash
mw run path/to/mission.md
mw runs
mw serve
```

`PI_BIN` can point Missionwriter at a specific `pi` executable. A mission can override pi's configured model with `writer.model`, using a `provider/id` value such as `openai-codex/gpt-5.5`.

## Mission file format

```yaml
---
shape: review | write | review-rewrite | revise
workdir: ./relative/path
writer:
  provider: eve
  model: openai-codex/gpt-5.5
contributors:
  - id: grok-strategist
    provider: xai
    model: grok-4.3
    role: strategic-review
  - id: opus-reviewer
    provider: agent-sessions
    model: claude-opus-4-8
    transport: tmux
    role: engineering-docs-review
inputs:
  - source.md
outputs:
  - draft.md
  - reviews.md
budget:
  tokens: 80000
  toolCalls: 30
---

Brief: Describe the work, the audience, and what a good result should do.
```

The frontmatter is the execution contract. The body is the writing brief.

## Shapes

- `review` reads the declared inputs and produces a structured critique. Writer file tools are read-only.
- `write` creates the named outputs from the brief and inputs.
- `review-rewrite` gathers review findings, records them, and produces a rewritten draft.
- `revise` edits one Markdown document in place. The live workspace uses this shape for focused human-agent revision.

## Writers

The shared runtime is not tied to one SDK. A writer adapter launches the selected agent in the declared workdir and streams the run back through Missionwriter.

| Writer | Backend | Authentication | Notes |
| --- | --- | --- | --- |
| `eve` (default) | `pi` coding-agent harness | pi's provider configuration | Host-scoped tools, sessions, and model selection. Review missions use read-only tools. |
| `cursor` | `@cursor/sdk` | `CURSOR_API_KEY` | Optional adapter. Can use Cursor-native reviewer subagents for `review-rewrite`. |

For Cursor, provide `CURSOR_API_KEY` through the environment, `~/.missionwriter/providers.env`, `~/.cursor/api_key.env`, or a compatible `secret get` keychain command.

### Eve subagents

Eve can fan out `review-rewrite` work through pi's `subagent` extension. Install the extension and provide reviewer definitions under `~/.pi/agent/agents/`, then name them in the mission:

```yaml
writer:
  provider: eve
  reviewers: [editorial, strategic, technical]
```

Example reviewer definitions live in [`examples/agents/`](examples/agents).

## Contributors

Contributors are independent review voices that run before the writer. They receive the brief and declared inputs, return Markdown reports, and cannot edit the workdir. The writer gets those reports as additional context.

| Provider | Default model | Authentication |
| --- | --- | --- |
| `xai` | `grok-4.3` | `XAI_API_KEY` |
| `openrouter` | `openrouter/auto` | `OPENROUTER_API_KEY` |
| `minimax` | `MiniMax-M3` | `MINIMAX_API_KEY` |
| `agent-sessions` | `claude-opus-4-8` | local agent executable |
| `copilot-cli` | `gemini-3.1-pro-preview` | local `copilot-ask` bridge |

Built-in contributor roles include `editorial-review`, `strategic-review`, `technical-precision`, `engineering-docs-review`, and `fresh-context-research`. A contributor can also supply a custom prompt.

`agent-sessions` supports ephemeral direct processes and persistent tmux transports. Persistent sessions can be listed, attached, compacted, cleared, or killed through `mw session`:

```bash
mw session list
mw session attach opus-reviewer --exec
mw session compact opus-reviewer
mw session timeline opus-reviewer
```

## Runs and provenance

Every run is stored under `.runs/<timestamp>__<shape>/` by default. Set `MW_RUNS_DIR` to use another root store.

A run records:

- an immutable Markdown copy of the resolved starting brief, captured before agent work begins;
- the mission source, writer, model, timing, and status;
- immutable before and after copies of declared outputs;
- the agent session transcript when the writer provides one;
- the parent run and output origin for revisions launched from the editor.

```bash
mw runs
mw show
mw show <run-id>
mw serve [port]
```

`mw show` renders the captured Eve session through pi. `mw serve` provides the complete run browser, immutable brief and output views, diff, live editor, transcript, and agent revision workflow. Running missions appear immediately; their activity and emerging documents refresh in place until completion.

## Safety model

- The workdir bounds the mission's file access.
- The live API resolves only outputs declared in the run metadata.
- Live editing accepts Markdown extensions, enforces a 4 MiB limit, rejects traversal and escaping symlinks, and uses atomic writes.
- Saves and agent revisions require the current content revision. Stale callers receive a conflict instead of overwriting newer work.
- `budget` values are framing for the agent, not hard runtime limits.

## Landing page

The landing page lives in [`site/`](site/) and is statically generated for GitHub Pages.

```bash
bun run site:dev
bun run site:typecheck
bun run site:build
```

Pushes to `main` that change the site or its build configuration publish `site/out` to [arach.github.io/missionwriter](https://arach.github.io/missionwriter/).
