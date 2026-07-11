import { NextResponse } from "next/server";
import {
  RevisionContextError,
  formatRevisionBrief,
  parseRevisionContextNotes,
} from "@mw/context-notes";
import {
  LiveDocumentError,
  assertLiveDocumentRevision,
  readLiveDocument,
} from "@mw/live-documents";
import type { MissionSpec } from "@mw/mission";
import { runMission } from "@mw/runner";
import { readRun } from "@mw/runs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; index: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const { id, index: rawIndex } = await params;
  const run = readRun(id);
  if (!run) return NextResponse.json({ error: `run not found: ${id}` }, { status: 404 });

  try {
    const index = parseIndex(rawIndex);
    const body = await request.json() as { prompt?: unknown; revision?: unknown; notes?: unknown };
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (body.prompt !== undefined && typeof body.prompt !== "string") {
      return NextResponse.json({ error: "prompt must be a string" }, { status: 400 });
    }
    if (prompt.length > 32_000) return NextResponse.json({ error: "prompt exceeds 32,000 characters" }, { status: 413 });
    if (body.revision !== null && typeof body.revision !== "string") {
      return NextResponse.json({ error: "revision must be a string or null" }, { status: 400 });
    }

    const current = assertLiveDocumentRevision(run, index, body.revision);
    const notes = parseRevisionContextNotes(body.notes, current.document.value);
    if (!prompt && notes.length === 0) {
      return NextResponse.json({ error: "provide a prompt or at least one in-context note" }, { status: 400 });
    }
    const output = run.outputs?.[index];
    if (!output) throw new LiveDocumentError("not_found", "declared output not found", 404);

    const spec: MissionSpec = {
      shape: "revise",
      brief: formatRevisionBrief(prompt, notes),
      workdir: run.workdir,
      writer: { provider: run.writer, model: run.model },
      inputs: [output.rel],
      outputs: [output.rel],
      source: run.mission,
      origin: {
        kind: "editor",
        parentRunId: run.id,
        outputIndex: index,
        outputRel: output.rel,
      },
    };

    const revisionRun = await runMission(spec);
    return NextResponse.json({
      run: revisionRun,
      beforeRevision: current.revision,
      live: readLiveDocument(revisionRun, 0),
    });
  } catch (error) {
    if (error instanceof RevisionContextError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof LiveDocumentError) {
      return NextResponse.json(
        { error: error.message, code: error.code, ...(error.latest ? { latest: error.latest } : {}) },
        { status: error.status },
      );
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

function parseIndex(value: string): number {
  const index = Number(value);
  if (!Number.isInteger(index) || index < 0) {
    throw new LiveDocumentError("not_found", "output index must be a non-negative integer", 404);
  }
  return index;
}
