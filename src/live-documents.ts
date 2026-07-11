import {
  accessSync,
  closeSync,
  existsSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  constants,
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { basename, dirname, extname, isAbsolute, relative, resolve } from "node:path";

import type { RunArtifact, RunMeta } from "./runs";

export const MAX_LIVE_DOCUMENT_BYTES = 4 * 1024 * 1024;
const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx", ".markdown"]);

export type LiveDocumentErrorCode =
  | "not_found"
  | "not_markdown"
  | "path_escape"
  | "not_file"
  | "not_writable"
  | "too_large"
  | "conflict";

export class LiveDocumentError extends Error {
  constructor(
    public readonly code: LiveDocumentErrorCode,
    message: string,
    public readonly status: number,
    public readonly latest?: LiveDocumentPayload,
  ) {
    super(message);
    this.name = "LiveDocumentError";
  }
}

export interface LiveDocumentPayload {
  document: {
    id: string;
    title: string;
    uri: string;
    mediaType: "text/markdown";
    language: "markdown";
    kind: "markdown";
    value: string;
    readOnly: boolean;
  };
  output: { index: number; name: string; rel: string };
  revision: string | null;
  exists: boolean;
  writable: boolean;
}

interface ResolvedOutput {
  artifact: RunArtifact;
  index: number;
  workdir: string;
  target: string;
  exists: boolean;
}

export function isMarkdownOutput(output: Pick<RunArtifact, "rel">): boolean {
  return MARKDOWN_EXTENSIONS.has(extname(output.rel).toLowerCase());
}

export function readLiveDocument(run: RunMeta, outputIndex: number): LiveDocumentPayload {
  const resolved = resolveOutput(run, outputIndex);
  let value = "";
  let revision: string | null = null;

  if (resolved.exists) {
    const size = statSync(resolved.target).size;
    if (size > MAX_LIVE_DOCUMENT_BYTES) {
      throw new LiveDocumentError("too_large", "document exceeds the 4 MiB editor limit", 413);
    }
    const bytes = readFileSync(resolved.target);
    value = bytes.toString("utf8");
    revision = hash(bytes);
  }

  return payloadFor(run, resolved, value, revision);
}

export function writeLiveDocument(
  run: RunMeta,
  outputIndex: number,
  value: string,
  expectedRevision: string | null,
): LiveDocumentPayload {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.byteLength > MAX_LIVE_DOCUMENT_BYTES) {
    throw new LiveDocumentError("too_large", "document exceeds the 4 MiB editor limit", 413);
  }

  const resolved = resolveOutput(run, outputIndex);
  const current = readLiveDocument(run, outputIndex);
  if (current.revision !== expectedRevision) {
    throw new LiveDocumentError("conflict", "document changed on disk", 409, current);
  }
  if (!current.writable) {
    throw new LiveDocumentError("not_writable", "document is not writable", 403, current);
  }

  const temporary = resolve(dirname(resolved.target), `.${basename(resolved.target)}.mw-${process.pid}-${randomUUID()}.tmp`);
  const mode = resolved.exists ? statSync(resolved.target).mode : 0o644;
  let descriptor: number | null = null;
  try {
    descriptor = openSync(temporary, "wx", mode);
    writeFileSync(descriptor, bytes);
    closeSync(descriptor);
    descriptor = null;
    renameSync(temporary, resolved.target);
  } finally {
    if (descriptor !== null) closeSync(descriptor);
    if (existsSync(temporary)) rmSync(temporary, { force: true });
  }

  return readLiveDocument(run, outputIndex);
}

export function assertLiveDocumentRevision(run: RunMeta, outputIndex: number, revision: string | null): LiveDocumentPayload {
  const current = readLiveDocument(run, outputIndex);
  if (current.revision !== revision) {
    throw new LiveDocumentError("conflict", "document changed on disk", 409, current);
  }
  if (!current.exists) throw new LiveDocumentError("not_found", "document does not exist", 404, current);
  if (!current.writable) throw new LiveDocumentError("not_writable", "document is not writable", 403, current);
  return current;
}

function resolveOutput(run: RunMeta, outputIndex: number): ResolvedOutput {
  const artifact = run.outputs?.[outputIndex];
  if (!artifact) throw new LiveDocumentError("not_found", "declared output not found", 404);
  if (!isMarkdownOutput(artifact)) {
    throw new LiveDocumentError("not_markdown", "live editing is limited to Markdown outputs", 415);
  }
  if (!existsSync(run.workdir)) throw new LiveDocumentError("not_found", "run workdir no longer exists", 404);

  const workdir = realpathSync(run.workdir);
  const targetCandidate = resolve(workdir, artifact.rel);
  if (!inside(workdir, targetCandidate)) {
    throw new LiveDocumentError("path_escape", "declared output escapes the run workdir", 403);
  }

  const targetExists = existsSync(targetCandidate);
  const target = targetExists ? realpathSync(targetCandidate) : targetCandidate;
  const parent = realpathSync(dirname(targetCandidate));
  if (!inside(workdir, target) || !inside(workdir, parent)) {
    throw new LiveDocumentError("path_escape", "declared output resolves outside the run workdir", 403);
  }
  if (targetExists && (!lstatSync(targetCandidate).isFile() || !statSync(target).isFile())) {
    throw new LiveDocumentError("not_file", "declared output is not a regular file", 415);
  }

  return { artifact, index: outputIndex, workdir, target, exists: targetExists };
}

function payloadFor(run: RunMeta, resolved: ResolvedOutput, value: string, revision: string | null): LiveDocumentPayload {
  let writable = false;
  try {
    accessSync(resolved.exists ? resolved.target : dirname(resolved.target), constants.W_OK);
    writable = true;
  } catch {
    writable = false;
  }

  return {
    document: {
      id: `run:${run.id}:output:${resolved.index}`,
      title: resolved.artifact.name,
      uri: `mw://runs/${encodeURIComponent(run.id)}/outputs/${resolved.index}`,
      mediaType: "text/markdown",
      language: "markdown",
      kind: "markdown",
      value,
      readOnly: !writable,
    },
    output: { index: resolved.index, name: resolved.artifact.name, rel: resolved.artifact.rel },
    revision,
    exists: resolved.exists,
    writable,
  };
}

function inside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function hash(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
