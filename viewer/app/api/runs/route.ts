import { NextResponse } from "next/server";
import { listRunViews } from "@/src/runs-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/runs → RunView[] (RunMeta + hasSession), newest-first. */
export function GET() {
  return NextResponse.json(listRunViews());
}
