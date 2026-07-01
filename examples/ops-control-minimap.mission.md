---
shape: review-rewrite
workdir: ../../openscout/landing/content/blog
model: default
inputs:
  - ops-control-minimap-shell-chrome.md
outputs:
  - ops-control-minimap-shell-chrome.draft.md
  - ops-control-minimap-shell-chrome.reviews.md
budget:
  tokens: 80000
  toolCalls: 30
---

Brief:

The input is a design-narrative blog post about why the Ops Control minimap was implemented as shell chrome instead of a canvas widget.

Run a 3-lens review (editorial / strategic / technical-precision) using the Task tool to spawn the registered subagents in parallel. Consolidate their reports into `ops-control-minimap-shell-chrome.reviews.md` next to the input.

Then produce a tightened v2 draft applying the consensus fixes:
- Cut every line two or more reviewers flagged for removal.
- Reduce abstraction; replace vague nouns with concrete language only when the meaning is clear.
- Tie the filtering section directly to the shell-chrome thesis.
- End on a concrete sentence, not an abstract flourish.
- Preserve the YAML frontmatter exactly (you may rewrite the title/excerpt only if a reviewer suggests genuinely sharper alternatives).
- Target ~60-75% of the original line count.

Save the rewrite as `ops-control-minimap-shell-chrome.draft.md`. Do not modify the original.
