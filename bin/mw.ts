#!/usr/bin/env bun
import { loadMission } from "../src/mission.js";
import { runMission } from "../src/runner.js";
import { runSessionCommand } from "../src/session-cli.js";

function usage(exitCode = 0): never {
  console.error(`Usage:
  mw run <mission.md>
  mw session <action> [args]

Run \`mw session help\` for tmux session management.

Mission file format (frontmatter):
  ---
  shape: review | write | review-rewrite
  workdir: ./relative/path        # defaults to dirname(mission file)
  provider: cursor                # optional writer provider, default 'cursor'
  model: default                  # optional, default Cursor model alias
  contributors:
    - id: grok-strategist
      provider: xai
      model: grok-4.3
      role: strategic-review
  inputs:
    - path/to/source.md
  outputs:
    - draft.md
    - reviews.md
  budget:
    tokens: 200000
    toolCalls: 50
  ---
  Brief: free text describing what to do.

Run \`mw run examples/ops-control-minimap.mission.md\` to see a working example.
`);
  process.exit(exitCode);
}

const [, , cmd, missionPath] = process.argv;

if (cmd === "run") {
  if (!missionPath) usage(1);
  const spec = loadMission(missionPath!);
  await runMission(spec);
} else if (cmd === "session") {
  try {
    await runSessionCommand(process.argv.slice(3));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`mw: ${message}`);
    process.exit(1);
  }
} else if (cmd === "-h" || cmd === "--help" || !cmd) {
  usage(0);
} else {
  console.error(`mw: unknown command '${cmd}'`);
  usage(1);
}
