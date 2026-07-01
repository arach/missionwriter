---
shape: write
workdir: ..
writer:
  provider: eve
inputs:
  - README.md
  - package.json
outputs:
  - website-outline.md
---

Write the marketing copy for the missionwriter landing page, structured as a
website outline. First read README.md and package.json to understand what the
product actually is — do not invent features or metrics.

Produce `website-outline.md` with these sections, copy written for each:

1. **Hero** — a punchy headline (≤8 words), a one-sentence subhead, and a
   primary call-to-action. A short secondary line with the install/run command.
2. **What it is** — one tight paragraph (2–3 sentences).
3. **Feature sections** (3–5), each a short heading + 1–2 sentences, drawn from
   the real product: mission files (frontmatter + brief), the Eve/`pi` writer
   ("the agent is the harness"), the shapes (review / write / review-rewrite),
   and contributors (multi-provider review voices).
4. **How it works** — the three-step flow: mission → writer agent in the
   workdir → files out.
5. **Closing CTA** — a final line plus the `bun install` / `mw run` snippet.

Tone: technical, confident, concise — written for developers. No hype, no
buzzwords, no invented numbers. Keep every section tight. Write only
`website-outline.md`; do not modify any other file.
