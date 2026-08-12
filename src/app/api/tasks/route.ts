import { after, NextRequest, NextResponse } from "next/server";
import { trackProductEvent } from "@/lib/analytics/events";
import { requireCurrentUser } from "@/lib/auth/session";
import { serverEnv } from "@/config/server-env";
import { prisma } from "@/lib/db/prisma";
import { assertSameOrigin } from "@/lib/http/security";
import { rublesToKopecks } from "@/lib/money";
import { enqueueNotification } from "@/lib/notifications/outbox";
import { createTaskSchema, resolveTaskTiming } from "@/lib/tasks/task-input";
import { isRepeatableTaskStatus } from "@/lib/tasks/policy";
import { formatRubles } from "@/lib/utils";
import { usersAreBlocked } from "@/server/services/user-blocks";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    const input = createTaskSchema.parse(await request.json());
    const priceKopecks = rublesToKopecks(input.priceRubles);
    const category = await prisma.category.findFirst({ where: { id: input.categoryId, isActive: true } });
    if (!category) return NextResponse.json({ error: "Категория недоступна." }, { status: 400 });

    const now = new Date();
    const { startsAt, expiresAt } = resolveTaskTiming(input, now);

    const task = await prisma.$transaction(async (tx) => {
      const repeatSource = input.repeatOfTaskId
        ? await tx.task.findFirst({
          where: { id: input.repeatOfTaskId, customerId: user.id },
          select: {
            id: true,
            status: true,
            matches: {
              where: { status: "COMPLETED" },
              orderBy: { completedAt: "desc" },
              take: 1,
              select: {
                performer: { select: { id: true, displayName: true, telegramChatId: true, status: true, roles: true } },
              },
            },
          },
        })
        : null;
      if (input.repeatOfTaskId && (!repeatSource || !isRepeatableTaskStatus(repeatSource.status))) {
        throw new Error("REPEAT_TASK_INVALID");
      }

      const candidate = input.offerPreviousPerformer ? repeatSource?.matches[0]?.performer : null;
      const candidateBlocked = candidate ? await usersAreBlocked(tx, user.id, candidate.id) : false;
      const preferredPerformer = candidate?.status === "ACTIVE" && candidate.roles.includes("PERFORMER") && !candidateBlocked
        ? candidate
        : null;
      const earlyAccessUntil = preferredPerformer ? new Date(now.getTime() + 4 * 60_000) : null;
      const created = await tx.task.create({
        data: {
          customerId: user.id,
          categoryId: category.id,
          title: input.title,
          description: input.description,
          priceKopecks,
          latitude: input.latitude,
          longitude: input.longitude,
          addressLabel: input.addressLabel || null,
          startsAt,
          expiresAt,
          searchRadiusMeters: 1000,
          status: "PUBLISHED",
          publishedAt: now,
          instantAccept: true,
          isUrgent: input.isUrgent,
          paymentMethod: input.paymentMethod,
          repeatOfTaskId: repeatSource?.id ?? null,
          preferredPerformerId: preferredPerformer?.id ?? null,
          earlyAccessUntil,
          nextMatchingAt: earlyAccessUntil ?? now,
        },
        select: { id: true },
      });

      if (preferredPerformer) {
        await enqueueNotification(tx, {
          userId: preferredPerformer.id,
          taskId: created.id,
          type: "REPEAT_TASK_EARLY_ACCESS",
          title: "Вас зовут снова",
          body: `«${input.title}» — ${formatRubles(priceKopecks)}. У вас есть 4 минуты, чтобы взять задачу первым.`,
          button: { label: "Посмотреть первым", url: `${serverEnv.APP_URL}/tasks/${created.id}` },
          dedupeKey: `task:${created.id}:early-access:${preferredPerformer.id}`,
          telegramEnabled: Boolean(preferredPerformer.telegramChatId),
        });
      }
      return { ...created, repeated: Boolean(repeatSource), earlyAccess: Boolean(preferredPerformer) };
    }, { isolationLevel: "Serializable", maxWait: 5_000, timeout: 10_000 });

    after(() => {
      trackProductEvent({ name: "task_created", userId: user.id, taskId: task.id, properties: { urgent: input.isUrgent, repeated: task.repeated } });
      if (task.repeated) trackProductEvent({ name: "repeat_task", userId: user.id, taskId: task.id, properties: { earlyAccess: task.earlyAccess } });
    });
    return NextResponse.json({ ok: true, taskId: task.id }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Войдите в аккаунт." }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : "Не удалось создать задачу.";
    if (message === "TASK_START_IN_PAST") return NextResponse.json({ error: "Время начала уже прошло." }, { status: 400 });
    if (message === "REPEAT_TASK_INVALID" || message === "REPEAT_TASK_REQUIRED") return NextResponse.json({ error: "Исходную задачу нельзя повторить." }, { status: 409 });
    return NextResponse.json({ error: message }, { status: message === "INVALID_ORIGIN" ? 403 : 400 });
  }
}
