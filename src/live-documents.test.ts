import { afterEach, describe, expect, it } from "bun:test";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  LiveDocumentError,
  MAX_LIVE_DOCUMENT_BYTES,
  readLiveDocument,
  writeLiveDocument,
} from "./live-documents";
import type { RunMeta } from "./runs";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "mw-live-document-"));
  temporaryDirectories.push(directory);
  return directory;
}

function runFor(workdir: string, rel = "draft.md"): RunMeta {
  return {
    id: "run-1",
    mission: join(workdir, "mission.md"),
    shape: "write",
    writer: "eve",
    model: "default",
    workdir,
    startedAt: new Date(0).toISOString(),
    status: "finished",
    outputs: [{ name: rel.split("/").pop() ?? rel, rel, hadBefore: false, bytesAfter: null }],
  };
}

describe("live Markdown documents", () => {
  it("round-trips exact Markdown and YAML frontmatter", () => {
    const directory = temporaryDirectory();
    const path = join(directory, "draft.md");
    const original = "---\ntitle: Exact\n---\n\n# Draft\n";
    writeFileSync(path, original);
    const run = runFor(directory);

    const before = readLiveDocument(run, 0);
    const next = `${original}\nOne more line.\n`;
    const after = writeLiveDocument(run, 0, next, before.revision);

    expect(after.document.value).toBe(next);
    expect(readFileSync(path, "utf8")).toBe(next);
    expect(after.revision).not.toBe(before.revision);
  });

  it("creates a missing declared Markdown output atomically", () => {
    const directory = temporaryDirectory();
    const run = runFor(directory);
    const before = readLiveDocument(run, 0);

    expect(before.exists).toBe(false);
    const after = writeLiveDocument(run, 0, "# Created\n", null);
    expect(after.exists).toBe(true);
    expect(readFileSync(join(directory, "draft.md"), "utf8")).toBe("# Created\n");
  });

  it("rejects stale saves with the latest disk document", () => {
    const directory = temporaryDirectory();
    const path = join(directory, "draft.md");
    writeFileSync(path, "first");
    const run = runFor(directory);
    const stale = readLiveDocument(run, 0);
    writeFileSync(path, "external edit");

    expect(() => writeLiveDocument(run, 0, "browser edit", stale.revision)).toThrow(LiveDocumentError);
    try {
      writeLiveDocument(run, 0, "browser edit", stale.revision);
    } catch (error) {
      expect(error).toBeInstanceOf(LiveDocumentError);
      expect((error as LiveDocumentError).code).toBe("conflict");
      expect((error as LiveDocumentError).latest?.document.value).toBe("external edit");
    }
  });

  it("rejects oversized content before writing", () => {
    const directory = temporaryDirectory();
    const run = runFor(directory);
    expect(() => writeLiveDocument(run, 0, "x".repeat(MAX_LIVE_DOCUMENT_BYTES + 1), null)).toThrow(
      /4 MiB/,
    );
  });

  it("rejects path traversal outside the run workdir", () => {
    const directory = temporaryDirectory();
    const run = runFor(directory, "../outside.md");
    expect(() => readLiveDocument(run, 0)).toThrow(/escapes the run workdir/);
  });

  it("rejects symlinks that escape the run workdir", () => {
    const directory = temporaryDirectory();
    const outside = temporaryDirectory();
    writeFileSync(join(outside, "secret.md"), "secret");
    symlinkSync(join(outside, "secret.md"), join(directory, "draft.md"));
    const run = runFor(directory);
    expect(() => readLiveDocument(run, 0)).toThrow(/outside the run workdir/);
  });

  it("rejects non-Markdown declared outputs", () => {
    const directory = temporaryDirectory();
    const run = runFor(directory, "draft.txt");
    expect(() => readLiveDocument(run, 0)).toThrow(/limited to Markdown/);
  });
});
