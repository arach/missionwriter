import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { listRunViews, readRunBrief, readRunDocuments } from "./runs-data";

const previousRunsDir = process.env.MW_RUNS_DIR;
const temporaryDirectories: string[] = [];

afterEach(() => {
  if (previousRunsDir === undefined) delete process.env.MW_RUNS_DIR;
  else process.env.MW_RUNS_DIR = previousRunsDir;
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("active run data", () => {
  it("exposes the captured brief and emerging output before completion", () => {
    const root = mkdtempSync(join(tmpdir(), "mw-active-run-"));
    temporaryDirectories.push(root);
    const runsDir = join(root, "runs");
    const runDir = join(runsDir, "active__write");
    const workdir = join(root, "workdir");
    mkdirSync(runDir, { recursive: true });
    mkdirSync(workdir, { recursive: true });
    process.env.MW_RUNS_DIR = runsDir;

    writeFileSync(join(runDir, "brief.md"), "# Starting brief\n\nDraft the launch note.\n");
    writeFileSync(join(workdir, "draft.md"), "# Emerging draft\n");
    writeFileSync(join(runDir, "run.json"), JSON.stringify({
      id: "active__write",
      mission: join(workdir, "launch.mission.md"),
      shape: "write",
      writer: "eve",
      model: "default",
      workdir,
      startedAt: "2026-07-12T12:00:00.000Z",
      status: "running",
      outputs: [{ name: "draft.md", rel: "draft.md", hadBefore: false, bytesAfter: null }],
    }));

    expect(listRunViews()).toEqual([
      expect.objectContaining({ id: "active__write", status: "running" }),
    ]);
    expect(readRunBrief("active__write")).toBe("# Starting brief\n\nDraft the launch note.\n");
    expect(readRunDocuments("active__write")[0]?.after).toBe("# Emerging draft\n");
  });
});
