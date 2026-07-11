import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runMission } from "./runner";
import type { MissionSpec } from "./mission";
import type { Writer } from "./writer";

const previousRunsDir = process.env.MW_RUNS_DIR;
const temporaryDirectories: string[] = [];

afterEach(() => {
  if (previousRunsDir === undefined) delete process.env.MW_RUNS_DIR;
  else process.env.MW_RUNS_DIR = previousRunsDir;
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("revise runs", () => {
  it("edits the live file and records immutable before/after artifacts with editor origin", async () => {
    const root = mkdtempSync(join(tmpdir(), "mw-revise-run-"));
    temporaryDirectories.push(root);
    const workdir = join(root, "workdir");
    const runsDir = join(root, "runs");
    mkdirSync(workdir, { recursive: true });
    writeFileSync(join(workdir, "draft.md"), "# Before\n");
    process.env.MW_RUNS_DIR = runsDir;

    const spec: MissionSpec = {
      shape: "revise",
      brief: "Make the title concrete.",
      workdir,
      writer: { provider: "eve", model: "default" },
      inputs: ["draft.md"],
      outputs: ["draft.md"],
      source: join(workdir, "mission.md"),
      origin: { kind: "editor", parentRunId: "parent-run", outputIndex: 0, outputRel: "draft.md" },
    };
    const fakeWriter: Writer = {
      async run() {
        writeFileSync(join(workdir, "draft.md"), "# After\n");
      },
    };

    const run = await runMission(spec, { writer: fakeWriter });
    const artifacts = join(runsDir, run.id, "artifacts");

    expect(run.status).toBe("finished");
    expect(run.origin).toEqual(spec.origin);
    expect(readFileSync(join(artifacts, "before__draft.md"), "utf8")).toBe("# Before\n");
    expect(readFileSync(join(artifacts, "after__draft.md"), "utf8")).toBe("# After\n");
    expect(readFileSync(join(workdir, "draft.md"), "utf8")).toBe("# After\n");
  });
});
