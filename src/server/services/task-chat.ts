import "server-only";

import { prisma } from "@/lib/db/prisma";
import { VISIBLE_MATCH_STATUSES } from "@/lib/tasks/policy";
import { assertUsersCanInteract } from "@/server/services/user-blocks";

export async function requireTaskConversation(taskId: string, userId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      customerId: true,
      matches: { where: { status: { in: [...VISIBLE_MATCH_STATUSES] } }, orderBy: { createdAt: "desc" }, take: 1, select: { performerId: true } },
    },
  });
  if (!task) throw new Error("TASK_NOT_FOUND");
  const performerId = task.matches[0]?.performerId;
  if (userId !== task.customerId && userId !== performerId) throw new Error("CHAT_FORBIDDEN");
  if (performerId) await assertUsersCanInteract(prisma, task.customerId, performerId);
  return { customerId: task.customerId, performerId };
}
