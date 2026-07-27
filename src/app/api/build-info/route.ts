import { NextResponse } from "next/server";

// Always dynamic, never cached — the whole point is for a client that's
// been open since before a deploy to learn the CURRENT build id, which a
// cached/static response could never reflect.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? "local" },
    { headers: { "Cache-Control": "no-store, must-revalidate" } }
  );
}
