import { NextResponse } from "next/server";
import { readRunSession } from "@/src/runs-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/runs/[id]/session → the run's Eve session, parsed natively from the
 * newest `.jsonl` into ordered, normalized turns (`{ role, timestamp, blocks }`).
 * Replaces the old `pi --export` HTML iframe — the transcript is now rendered
 * in-app, on-brand, as a supporting "how it was made" view. 404 when no session.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = readRunSession(id);
  if (!session) {
    return NextResponse.json({ error: `no session captured for run: ${id}` }, { status: 404 });
  }
  return NextResponse.json(session);
}
