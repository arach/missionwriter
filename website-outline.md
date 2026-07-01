# missionwriter Website Outline

## 1. Hero

**Headline:** Writing missions for coding agents

**Subhead:** missionwriter turns a markdown mission file into a scoped writing or review run, using Eve/`pi` as the default writer agent and optional contributor reviews from other providers.

**Primary CTA:** Run a mission

**Install/run:** `bun install` → `mw run path/to/mission.md`

## 2. What it is

missionwriter is a light CLI for running writing and review missions in a real workdir. You define the brief, inputs, outputs, writer, and shape in one markdown file; `mw run` hands that context to the agent, which reads and writes files with scoped tools.

## 3. Feature sections

### Mission files are the interface

A mission is markdown with YAML frontmatter and a free-text brief. The frontmatter declares the workdir, inputs, outputs, writer, contributors, budget framing, and shape, so the run is explicit and repeatable.

### Eve/`pi` is the writer harness

The default writer is Eve, powered by the `pi` coding agent. missionwriter does not implement its own agent loop; it parses the mission, assembles the prompt, and lets the agent bring its own tools, sessions, provider config, and model selection.

### Pick the shape of the run

Use `review` for read-only critique, `write` for producing named files, or `review-rewrite` for a review pass followed by a rewrite. The shape tells the writer what kind of work to perform and what outputs to create.

### Add contributor review voices

Contributors run before the writer and return markdown reports without editing files. Use providers such as xAI, OpenRouter, MiniMax, agent-sessions, or a local Copilot CLI bridge to bring separate review perspectives into the final synthesis.

## 4. How it works

1. **Mission:** Write a `.mission.md` file with frontmatter plus the brief.
2. **Writer agent in the workdir:** `mw run` starts the selected writer, scoped to the declared workdir, with the mission inputs and any contributor reports.
3. **Files out:** The agent writes the named outputs, while run artifacts and the Eve session transcript are recorded under `.runs/`.

## 5. Closing CTA

Make writing work explicit: put the brief, files, and agent in a mission, then run it.

```bash
bun install
mw run path/to/mission.md
```
