import { NextRequest, NextResponse } from "next/server";

import { revokeCurrentSession } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/http/security";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    await revokeCurrentSession();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
}
