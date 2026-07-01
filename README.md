# missionwriter

A light CLI for running **writing & review missions** with a coding agent.

You write a *mission* — a markdown file with a bit of frontmatter and a brief — and `mw run` hands it to an agent working inside a scoped directory with file tools. The agent reads your inputs, does the work, and writes the outputs.

The core agent is the **Eve agent** — the [`pi`](https://github.com/earendil-works) coding agent — with an optional [Cursor](https://www.npmjs.com/package/@cursor/sdk) writer and review "contributors" from other LLM providers.

```bash
mw run examples/ops-control-minimap.mission.md
```

---

## How it works

```
mission.md ──▶ mw ──▶ writer agent (Eve / pi)  ──▶ files in the workdir
   (frontmatter        │  scoped to workdir          (draft.md, reviews.md, …)
    + brief)           │  read · write · edit
                       └─ optional: contributor reviews gathered first,
                          then synthesized by the writer
```

The writer *is* the harness. missionwriter doesn't carry its own agent loop — it parses the mission, assembles the prompt (framing + brief + any contributor reports), and drives the agent. For Eve that's the `pi` coding agent, which brings its own tools, session handling, and provider/model config.

---

## Setup

```bash
bun install
```

### Eve writer (default)

Install the `pi` coding agent so it's on your `PATH`:

```bash
npm install -g @earendil-works/pi-coding-agent   # provides the `pi` binary
```

`pi` resolves its **own** credentials (`~/.pi/agent/auth.json` or provider env vars), so no missionwriter key is needed for Eve. Its default provider/model come from `~/.pi/agent/settings.json` (e.g. `minimax` / `MiniMax-M2.7`); override per mission with `writer.model` (which also accepts a `provider/id` pattern like `anthropic/claude-opus-4.7`). Point at a specific binary with `PI_BIN`.

### Cursor writer (optional)

To use Cursor instead (`writer: { provider: cursor }`), provide a `CURSOR_API_KEY` one of three ways (env wins):

```bash
export CURSOR_API_KEY=...                          # ambient env
echo 'CURSOR_API_KEY=...' > ~/.missionwriter/providers.env   # shared providers file
echo 'CURSOR_API_KEY=...' > ~/.cursor/api_key.env  # cursor dotenv
```

missionwriter also falls back to `secret get NAME`, so keys can live in your keychain.

Optional: `bun link` to put `mw` on your `PATH` globally.

---

## Usage

```bash
bun bin/mw.ts run examples/ops-control-minimap.mission.md
# or, after `bun link`:
mw run path/to/mission.md
```

Assistant text streams to **stdout**; tool calls and status go to **stderr**, so you can pipe the prose cleanly:

```bash
mw run mission.md > draft-log.txt
```

Manage detached tmux contributor sessions (see [Contributors](#contributors)):

```bash
mw session list
mw session attach opus-reviewer --exec
mw session compact opus-reviewer
mw session timeline opus-reviewer
```

---

## Mission file format

```yaml
---
shape: review | write | review-rewrite
workdir: ./relative/path        # defaults to the mission file's directory
writer:
  provider: eve                 # 'eve' (default) | 'cursor'
  model: default                # 'default' inherits pi's model; or 'provider/id'
contributors:                   # optional review voices, gathered before the writer
  - id: grok-strategist
    provider: xai
    model: grok-4.3
    role: strategic-review
  - id: opus-reviewer
    provider: agent-sessions
    model: claude-opus-4-8
    transport: tmux             # direct (default) | tmux
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

Brief: free text describing what to do.
```

---

## Writers

The writer runs the core agent loop — it spawns the agent, gives it file tools scoped to the workdir, and streams output. Select it with `writer.provider` (or the top-level `provider`).

| Writer | Backend | Auth | Notes |
| --- | --- | --- | --- |
| **`eve`** (default) | `pi` coding agent | pi's own (`~/.pi/agent/auth.json`) | Runs host-scoped in the workdir. `review` shape → read-only tools. Model from pi's settings unless overridden. |
| **`cursor`** | `@cursor/sdk` | `CURSOR_API_KEY` | For `review-rewrite` with no contributors, fans out Cursor's native reviewer subagents. |

### Enable Eve subagents (optional)

For `review-rewrite`, the Eve writer can fan out review voices through pi's `subagent` tool instead of reviewing inline. Two one-time steps:

```bash
# 1. install pi's subagent extension (ships with pi; auto-discovered)
PI=$(dirname "$(dirname "$(readlink -f "$(command -v pi)")")")
ln -sfn "$PI/examples/extensions/subagent" ~/.pi/agent/extensions/subagent

# 2. install the demo reviewer agents (or write your own)
cp examples/agents/*.md ~/.pi/agent/agents/
```

Then name the reviewers in the mission — the core doesn't hard-code them:

```yaml
writer:
  provider: eve
  reviewers: [editorial, strategic, technical]   # agents in ~/.pi/agent/agents
```

The writer makes one parallel `subagent` call over those agents, consolidates their reports into the review output, then rewrites. Demo definitions live in [`examples/agents/`](examples/agents). If you omit `reviewers`, Eve reviews inline. `contributors` (below) is the writer-agnostic alternative and works with Cursor too.

---

## Shapes

- **`review`** — read inputs, produce a structured critique. No rewriting (read-only tools).
- **`write`** — synthesize the brief into the named output file(s).
- **`review-rewrite`** — review the inputs, consolidate findings into `reviews.md`, then produce a rewritten `draft.md`.

---

## Contributors

Contributors are review voices that run **before** the writer. They receive the brief and listed inputs, return markdown reports, and don't edit files — the writer then synthesizes their reports into the outputs.

| Provider | Default model | Key |
| --- | --- | --- |
| `xai` | `grok-4.3` | `XAI_API_KEY` |
| `openrouter` | `openrouter/auto` | `OPENROUTER_API_KEY` |
| `minimax` | `MiniMax-M3` | `MINIMAX_API_KEY` |
| `agent-sessions` | `claude-opus-4-8` | needs `claude` on `PATH` |
| `copilot-cli` | `gemini-3.1-pro-preview` | local `copilot-ask` bridge |

`agent-sessions` supports two transports:

- **`direct`** (default) — ephemeral subprocess via [`@openscout/agent-sessions`](https://www.npmjs.com/package/@openscout/agent-sessions).
- **`transport: tmux`** — a persistent tmux pane with Claude Code, reused across turns in a run. Sessions **detach on mission end** by default (attach with `tmux attach -t mw-<id>`) and self-kill after 30m idle. Tune with a mission-level or per-contributor `tmux:` block (`idleTimeoutMs`, `onMissionEnd: detach | kill | keep`), and manage them with `mw session` (`list`, `attach`, `compact`, `clear`, `kill`, `timeline`).

Built-in roles: `editorial-review`, `strategic-review`, `technical-precision`, `engineering-docs-review`, `fresh-context-research`. Or give any contributor a custom `prompt`.

---

## Runs

Every `mw run` records a run under `.runs/<timestamp>__<shape>/` (gitignored):

- `run.json` — mission, shape, writer, model, timing, status (missionwriter's thin index).
- the Eve session transcript (`.jsonl`) — captured via pi's `--session-dir`.

```bash
mw runs            # list past runs, newest first
mw show            # render the latest run's Eve session to HTML and open it
mw show <run-id>   # a specific run
```

`mw show` leans on Eve's own visibility: it renders the captured session with `pi --export`. missionwriter keeps the index; Eve provides the deep view.

## Notes

- The workdir is the sandbox: the agent's file tools are scoped to it. Stay inside; don't touch files outside the declared inputs/outputs.
- `budget` (tokens / tool calls) is advisory framing passed to the agent, not a hard enforced cap.
- Run artifacts land under `.runs/` (gitignored).
