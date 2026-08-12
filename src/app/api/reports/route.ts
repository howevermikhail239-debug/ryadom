import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { assertSameOrigin } from "@/lib/http/security";

const bodySchema = z.object({
  taskId: z.string().uuid().nullable().optional(),
  reportedUserId: z.string().uuid().nullable().optional(),
  reason: z.enum(["SPAM", "FRAUD", "PROHIBITED", "ABUSE", "OTHER"]),
  details: z.string().trim().max(1000).nullable().optional(),
}).refine((value) => Boolean(value.taskId) !== Boolean(value.reportedUserId), { message: "SINGLE_TARGET_REQUIRED" });

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    const input = bodySchema.parse(await request.json());
    if (input.reportedUserId === user.id) throw new Error("SELF_REPORT");
    if (input.taskId) {
      const exists = await prisma.task.count({ where: { id: input.taskId } });
      if (!exists) throw new Error("TARGET_NOT_FOUND");
    } else {
      const exists = await prisma.user.count({ where: { id: input.reportedUserId!, deletedAt: null } });
      if (!exists) throw new Error("TARGET_NOT_FOUND");
    }

    const existing = await prisma.report.findFirst({
      where: input.taskId ? { reporterId: user.id, taskId: input.taskId } : { reporterId: user.id, reportedUserId: input.reportedUserId },
      select: { id: true },
    });
    if (!existing) {
      try {
        await prisma.report.create({
          data: {
            reporterId: user.id,
            taskId: input.taskId ?? null,
            reportedUserId: input.reportedUserId ?? null,
            reason: input.reason,
            details: input.details || null,
          },
        });
      } catch (error) {
        const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
        if (code !== "P2002") throw error;
      }
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "REPORT_FAILED";
    const status = code === "UNAUTHORIZED" ? 401 : code === "INVALID_ORIGIN" ? 403 : code === "TARGET_NOT_FOUND" ? 404 : 400;
    const message = code === "SELF_REPORT" ? "Нельзя пожаловаться на себя." : status === 404 ? "Объект жалобы не найден." : status === 401 ? "Войдите в аккаунт." : "Проверьте данные жалобы.";
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
