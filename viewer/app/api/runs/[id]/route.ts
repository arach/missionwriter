import { NextResponse } from "next/server";
import { readRunView } from "@/src/runs-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/runs/[id] → one RunView, or 404. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = readRunView(id);
  if (!run) {
    return NextResponse.json({ error: `run not found: ${id}` }, { status: 404 });
  }
  return NextResponse.json(run);
}
