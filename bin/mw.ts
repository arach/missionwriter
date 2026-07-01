#!/usr/bin/env bun
import { loadMission } from "../src/mission.js";
import { runMission } from "../src/runner.js";
import { runSessionCommand } from "../src/session-cli.js";
import { printRuns, showRun, serveRuns } from "../src/runs.js";

function usage(exitCode = 0): never {
  console.error(`Usage:
  mw run <mission.md>
  mw runs                 # list past runs (.runs/)
  mw show [run-id]        # render a run's Eve session to HTML and open it (default: latest)
  mw serve [port]         # web viewer for runs (default port 4321)
  mw session <action> [args]

Run \`mw session help\` for tmux session management.

Mission file format (frontmatter):
  ---
  shape: review | write | review-rewrite
  workdir: ./relative/path        # defaults to dirname(mission file)
  provider: eve                   # optional writer provider, default 'eve' (or 'cursor')
  model: default                  # 'default' inherits pi's configured model
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
} else if (cmd === "runs") {
  printRuns();
} else if (cmd === "show") {
  showRun(missionPath);
} else if (cmd === "serve") {
  serveRuns(missionPath ? Number(missionPath) : undefined);
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
