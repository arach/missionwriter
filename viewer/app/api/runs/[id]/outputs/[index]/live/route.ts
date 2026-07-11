import { NextResponse } from "next/server";
import {
  LiveDocumentError,
  readLiveDocument,
  writeLiveDocument,
} from "@mw/live-documents";
import { readRun } from "@mw/runs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; index: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { id, index: rawIndex } = await params;
  const run = readRun(id);
  if (!run) return NextResponse.json({ error: `run not found: ${id}` }, { status: 404 });

  try {
    return NextResponse.json(readLiveDocument(run, parseIndex(rawIndex)));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request, { params }: RouteContext) {
  const { id, index: rawIndex } = await params;
  const run = readRun(id);
  if (!run) return NextResponse.json({ error: `run not found: ${id}` }, { status: 404 });

  try {
    const body = await request.json() as { value?: unknown; revision?: unknown };
    if (typeof body.value !== "string") {
      return NextResponse.json({ error: "value must be a string" }, { status: 400 });
    }
    if (body.revision !== null && typeof body.revision !== "string") {
      return NextResponse.json({ error: "revision must be a string or null" }, { status: 400 });
    }
    return NextResponse.json(writeLiveDocument(run, parseIndex(rawIndex), body.value, body.revision));
  } catch (error) {
    return errorResponse(error);
  }
}

function parseIndex(value: string): number {
  const index = Number(value);
  if (!Number.isInteger(index) || index < 0) {
    throw new LiveDocumentError("not_found", "output index must be a non-negative integer", 404);
  }
  return index;
}

function errorResponse(error: unknown) {
  if (error instanceof LiveDocumentError) {
    return NextResponse.json(
      { error: error.message, code: error.code, ...(error.latest ? { latest: error.latest } : {}) },
      { status: error.status },
    );
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
}
