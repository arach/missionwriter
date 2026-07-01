---
shape: review-rewrite
workdir: ..
writer:
  provider: eve
  model: openai-codex/gpt-5.5                     # a real writer; not minimax
  reviewers: [editorial, strategic, technical]   # demo agents; see examples/agents/
inputs:
  - website-outline.md
  - README.md
outputs:
  - reviews.md
  - website-outline.md
---

Review and improve the website landing-page copy in `website-outline.md`.

Run the three reviewer subagents — editorial, strategic, and technical — in
parallel over `website-outline.md`. The technical reviewer must check every
claim against `README.md`. Consolidate their findings into `reviews.md`, then
rewrite `website-outline.md` applying the consensus fixes: keep it strictly
accurate to the product, tighten the copy, and fix the hero headline if the
reviewers flag it as too narrow. Preserve the section structure.
