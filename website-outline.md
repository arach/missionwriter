# Website Outline — missionwriter

---

## 1. Hero

**Headline (≤8 words):**
> Brief the agent. Get the draft.

**Subhead:**
> Hand a brief to a coding agent; collect the draft.

**Primary CTA:**
> [Read the README →](#)

**Secondary line:**
> `bun install` · `npm install -g @earendil-works/pi-coding-agent` · `bun link` · `mw run path/to/mission.md`

---

## 2. What it is

missionwriter is a lightweight CLI for delegating writing and review work to a coding agent that operates directly inside your project directory. You describe what you need in a mission file — a short markdown brief with frontmatter — and the agent produces the outputs, scoped to your workdir.

---

## 3. Feature Sections

### 3a. Mission files are plain markdown

A mission is a `.md` file with YAML frontmatter and a brief. No config language to learn. Declare the workdir, the writer, any review contributors, and the inputs and outputs — then hand it to `mw run` and collect the results.

Pick the shape in frontmatter:

- **`review`** — read inputs, emit a structured critique. Read-only; no file writes.
- **`write`** — synthesize the brief into the named output file(s).
- **`review-rewrite`** — run the review, capture findings, then produce a rewritten draft.

```yaml
---
shape: review-rewrite
workdir: ./docs
inputs:
  - source.md
outputs:
  - draft.md
  - reviews.md
---
Brief: Revise this document for clarity and technical accuracy.
```

### 3b. The writer is Eve

The writer is Eve, the `pi` coding agent. missionwriter parses your mission, assembles the prompt, and drives Eve — which means Eve's tools, session handling, provider config, and model selection all apply unchanged. Model is inherited from Eve's settings unless you override it with `writer.model` (accepts `provider/id` patterns like `anthropic/claude-opus-4.7`). Swap models, swap providers, keep the same `mw run` call.

### 3c. Multi-provider review contributors

Define reviewer agents in the mission's `contributors` block and they run before the writer, returning markdown reports for the writer to synthesize. Providers include `xai`, `openrouter`, `minimax`, `agent-sessions` (with optional persistent tmux sessions), and `copilot-cli`. Built-in roles cover editorial review, strategic review, technical precision, and fresh-context research — or write your own prompt.

### 3d. Outputs land in the workdir

The agent's file tools are scoped to the declared `workdir`. Nothing is written outside it. Run artifacts go under `.runs/` (gitignored). Your inputs are never modified.

---

## 4. Closing CTA

Run your first mission today.

```bash
bun install
npm install -g @earendil-works/pi-coding-agent
bun link
mw run examples/ops-control-minimap.mission.md
```
