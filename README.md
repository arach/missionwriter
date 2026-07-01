# missionwriter

A light CLI for running writing & review missions on top of [`@cursor/sdk`](https://www.npmjs.com/package/@cursor/sdk), with optional review contributors from other LLM providers.

A mission is a markdown file (frontmatter + brief) describing what to write or review and where. `mw run mission.md` spawns a Cursor agent in the working directory with file tools. For `review-rewrite` missions, it either uses Cursor's native reviewer subagents or gathers configured contributor reports first, then asks Cursor to synthesize the reports and write files.

## Setup

```bash
bun install
```

Provide a Cursor API key one of three ways (env wins if multiple are set):

```bash
# Either: ambient env var
export CURSOR_API_KEY=...

# Or: shared Mission Writer providers file
mkdir -p ~/.missionwriter
echo 'CURSOR_API_KEY=...' > ~/.missionwriter/providers.env

# Or: dotenv-style file at a stable path
echo 'CURSOR_API_KEY=...' > ~/.cursor/api_key.env
```

Provider keys are resolved just-in-time and cached in memory for the current `mw` run. Mission Writer also falls back to `secret get NAME`, so xAI can be provided as:

```bash
secret get XAI_API_KEY
```

The command is only invoked when an xAI contributor actually runs.

Optional: `bun link` to put `mw` on PATH globally.

## Usage

```bash
bun bin/mw.ts run examples/ops-control-minimap.mission.md
# or after `bun link`:
mw run path/to/mission.md

# manage detached tmux contributor sessions
mw session list
mw session attach opus-reviewer --exec
mw session compact opus-reviewer
mw session clear opus-reviewer
mw session timeline opus-reviewer
```

## Mission file format

```yaml
---
shape: review | write | review-rewrite
workdir: ./relative/path        # defaults to dirname(mission file)
provider: cursor                # optional writer provider, default 'cursor'
model: default                  # any model the SDK exposes via Cursor.models.list()
writer:
  provider: cursor              # optional explicit writer
  model: default
contributors:
  - id: grok-strategist
    provider: xai
    model: grok-4.3
    role: strategic-review
    weight: primary
  - id: opus-reviewer
    provider: agent-sessions
    model: claude-opus-4-8
    transport: tmux          # optional: direct (default) | tmux
    role: engineering-docs-review
tmux:                        # optional tmux lifecycle defaults for agent-sessions/tmux
  idleTimeoutMs: 1800000     # kill after 30m idle (0 = never auto-kill)
  onMissionEnd: detach       # detach (default) | kill | keep
  - id: minimax-precision
    provider: minimax
    model: MiniMax-M3
    role: technical-precision
inputs:
  - source.md
outputs:
  - draft.md
  - reviews.md
budget:
  tokens: 80000
  toolCalls: 30
---

Brief: free text describing what to do.
```

## Shapes

- **`review`** — read inputs, produce a structured critique. No rewriting.
- **`write`** — synthesize the brief into the named output file(s).
- **`review-rewrite`** — fan out review subagents in parallel, consolidate reports, produce a rewritten draft.

## Contributors

Contributors are review voices that run before the Cursor writer. They receive the mission brief and listed input files, return markdown reports, and do not edit files directly.

Supported contributor providers:

- **`xai`** — OpenAI-compatible xAI chat completions. Default model: `grok-4.3`. Key: `XAI_API_KEY`.
- **`openrouter`** — OpenRouter chat completions. Default model: `openrouter/auto`. Key: `OPENROUTER_API_KEY`.
- **`minimax`** — MiniMax OpenAI-compatible chat completions. Default model: `MiniMax-M3`. Key: `MINIMAX_API_KEY`.
- **`agent-sessions`** — Claude Code via TypeScript SDK. Default model: `claude-opus-4-8`. Requires `claude` on PATH; `transport: tmux` also requires `tmux`.
  - **`transport: direct`** (default) — ephemeral `SessionRegistry` subprocess via [`@openscout/agent-sessions`](https://www.npmjs.com/package/@openscout/agent-sessions)
  - **`transport: tmux`** — persistent tmux pane with Claude Code, reused across contributor turns in the same `mw run`. Prompts via paste-buffer, response via pane capture. Sessions are tracked with a stderr timeline (`[mw:tmux]`) and saved to `~/.missionwriter/tmux-timeline.json`.
    - Default lifecycle: **detach on mission end** (session stays alive; attach with `tmux attach -t mw-<contributor-id>`), **kill after 30m idle** (idle timer runs during the mission; after detach, a background watcher kills the session when idle time expires).
    - Override globally with mission `tmux:` or per contributor `tmux:` (`idleTimeoutMs`, `onMissionEnd: detach | kill | keep`).
    - After detach, manage sessions with `mw session` (`list`, `attach`, `compact`, `clear`, `kill`, `timeline`). State lives in `~/.missionwriter/tmux-sessions.json`.
- **`copilot-cli`** — local `copilot-ask` bridge. Default model: `gemini-3.1-pro-preview` (non-Claude; use `copilot-ask --list-models` for GPT/Gemini options).

Known roles with built-in prompts: `editorial-review`, `strategic-review`, `technical-precision`, `engineering-docs-review`, `fresh-context-research`. You can also provide a custom `prompt` per contributor.

## Notes

- Workdir is sandboxed to the resolved path. The agent has Read/Write/Edit/Glob/Grep/Shell tools scoped to it.
- `review-rewrite` uses Cursor's native reviewer subagents when no contributors are configured. When contributors are configured, their reports replace the native review fanout.
- Output streams to stdout as the agent works; tool calls and result status go to stderr so you can pipe assistant text cleanly.
