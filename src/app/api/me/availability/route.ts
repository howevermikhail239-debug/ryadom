import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/http/security";
import { setUserAvailability } from "@/server/services/user-availability";

const inputSchema = z.object({ minutes: z.union([z.literal(0), z.literal(30), z.literal(60), z.literal(120)]) });

export async function PUT(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    if (!user.roles.includes("PERFORMER")) return NextResponse.json({ error: "Режим доступен исполнителям." }, { status: 403 });
    const { minutes } = inputSchema.parse(await request.json());
    const { availableUntil, locationActive } = await setUserAvailability(user.id, minutes);
    return NextResponse.json({ ok: true, availableUntil: availableUntil?.toISOString() ?? null, locationActive });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return NextResponse.json({ error: code === "UNAUTHORIZED" ? "Войдите в аккаунт." : "Не удалось изменить доступность." }, { status: code === "UNAUTHORIZED" ? 401 : code === "INVALID_ORIGIN" ? 403 : 400 });
  }
}
