import "server-only";

import { prisma } from "@/lib/db/prisma";
import { myTaskGroup } from "@/lib/tasks/my-task-status";
import type { MyTaskGroup, MyTaskItem, MyTaskRole } from "@/types/my-task";

export async function loadMyTasks(userId: string): Promise<MyTaskItem[]> {
  const [created, matches] = await Promise.all([
    prisma.task.findMany({
      where: { customerId: userId },
      orderBy: { updatedAt: "desc" },
      take: 200,
      include: { matches: { where: { status: { in: ["CREATED", "CONFIRMED", "IN_PROGRESS", "COMPLETED"] } }, orderBy: { createdAt: "desc" }, take: 1, select: { status: true } } },
    }),
    prisma.taskMatch.findMany({
      where: { performerId: userId },
      orderBy: { updatedAt: "desc" },
      take: 300,
      include: { task: true },
    }),
  ]);

  const customerItems: MyTaskItem[] = created.map((task) => {
    const matchStatus = task.matches[0]?.status ?? null;
    return {
      id: task.id,
      title: task.title,
      priceKopecks: task.priceKopecks,
      tipAmount: task.tipAmount,
      status: task.status,
      matchStatus,
      role: "customer",
      awaitingConfirmation: task.status === "IN_PROGRESS" && matchStatus === "COMPLETED",
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      latitude: Number(task.latitude),
      longitude: Number(task.longitude),
    };
  });

  const seenTasks = new Set<string>();
  const performerItems: MyTaskItem[] = [];
  for (const match of matches) {
    if (seenTasks.has(match.taskId)) continue;
    seenTasks.add(match.taskId);
    const effectiveStatus = match.status === "CANCELLED" ? "CANCELLED" : match.status === "DISPUTED" ? "DISPUTED" : match.task.status;
    performerItems.push({
      id: match.task.id,
      title: match.task.title,
      priceKopecks: match.agreedPriceKopecks,
      tipAmount: match.task.tipAmount,
      status: effectiveStatus,
      matchStatus: match.status,
      role: "performer",
      awaitingConfirmation: match.task.status === "IN_PROGRESS" && match.status === "COMPLETED",
      createdAt: match.task.createdAt.toISOString(),
      updatedAt: match.updatedAt.toISOString(),
      latitude: Number(match.task.latitude),
      longitude: Number(match.task.longitude),
    });
  }

  return [...customerItems, ...performerItems];
}

export function filterMyTasks(items: MyTaskItem[], role?: MyTaskRole, group?: MyTaskGroup) {
  return items.filter((item) => (!role || item.role === role) && (!group || myTaskGroup(item) === group));
}
