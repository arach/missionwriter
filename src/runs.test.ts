import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { MissionSpec } from "./mission";
import { startRun } from "./runs";

const previousRunsDir = process.env.MW_RUNS_DIR;
const temporaryDirectories: string[] = [];

afterEach(() => {
  if (previousRunsDir === undefined) delete process.env.MW_RUNS_DIR;
  else process.env.MW_RUNS_DIR = previousRunsDir;
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("run brief persistence", () => {
  it("captures the resolved brief before the run starts and never rewrites it", () => {
    const root = mkdtempSync(join(tmpdir(), "mw-run-brief-"));
    temporaryDirectories.push(root);
    process.env.MW_RUNS_DIR = join(root, "runs");

    const source = join(root, "mission.md");
    writeFileSync(source, "Original source file\n");
    const spec: MissionSpec = {
      shape: "write",
      brief: "# Starting brief\n\nWrite the durable first pass.\n\n",
      workdir: root,
      source,
    };

    const run = startRun(spec, "eve", "default");
    const briefPath = join(run.dir, "brief.md");

    expect(run.meta.status).toBe("running");
    expect(readFileSync(briefPath, "utf8")).toBe("# Starting brief\n\nWrite the durable first pass.\n");

    spec.brief = "A later in-memory edit";
    writeFileSync(source, "A later source edit\n");
    run.finish("finished");

    expect(readFileSync(briefPath, "utf8")).toBe("# Starting brief\n\nWrite the durable first pass.\n");
  });
});
