import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { assertSameOrigin } from "@/lib/http/security";

const inputSchema = z.object({
  nearbyEnabled: z.boolean(),
  radiusMeters: z.number().int().refine((value) => [500, 1000, 3000, 5000].includes(value)),
  categoryIds: z.array(z.string().uuid()).max(50),
  quietHoursStart: z.number().int().min(0).max(1439).nullable(),
  quietHoursEnd: z.number().int().min(0).max(1439).nullable(),
}).refine((value) => (value.quietHoursStart === null) === (value.quietHoursEnd === null), {
  message: "QUIET_HOURS_PAIR_REQUIRED",
});

export async function PUT(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    const input = inputSchema.parse(await request.json());
    const categoryIds = [...new Set(input.categoryIds)];
    const categoriesCount = await prisma.category.count({ where: { id: { in: categoryIds }, isActive: true } });
    if (categoriesCount !== categoryIds.length) throw new Error("INVALID_CATEGORY");

    await prisma.$transaction(async (tx) => {
      await tx.notificationPreference.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          nearbyEnabled: input.nearbyEnabled,
          radiusMeters: input.radiusMeters,
          quietHoursStart: input.quietHoursStart,
          quietHoursEnd: input.quietHoursEnd,
        },
        update: {
          nearbyEnabled: input.nearbyEnabled,
          radiusMeters: input.radiusMeters,
          quietHoursStart: input.quietHoursStart,
          quietHoursEnd: input.quietHoursEnd,
        },
      });
      await tx.notificationPreferenceCategory.deleteMany({ where: { preferenceUserId: user.id } });
      if (categoryIds.length > 0) {
        await tx.notificationPreferenceCategory.createMany({
          data: categoryIds.map((categoryId) => ({ preferenceUserId: user.id, categoryId })),
        });
      }
    }, { isolationLevel: "Serializable" });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_INPUT";
    const status = code === "UNAUTHORIZED" ? 401 : code === "INVALID_ORIGIN" ? 403 : 400;
    return NextResponse.json({ ok: false, error: status === 401 ? "Войдите в аккаунт." : "Проверьте настройки уведомлений." }, { status });
  }
}
