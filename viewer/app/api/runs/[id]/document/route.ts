import { NextResponse } from "next/server";
import { readRunBrief, readRunDocuments } from "@/src/runs-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/runs/[id]/document → the actual text a run produced.
 * `{ brief, outputs: [{ name, rel, hadBefore, after, before }] }`, reading the
 * immutable starting brief and captured `artifacts/after__<name>` /
 * `before__<name>` snapshots (falling back
 * to the live workdir file for older, pre-artifacts runs).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({ brief: readRunBrief(id), outputs: readRunDocuments(id) });
}
