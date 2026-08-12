import { FeedPage } from "@/components/feed/feed-page";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { isRepeatableTaskStatus } from "@/lib/tasks/policy";
import type { TaskCreatePrefill } from "@/types/task";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ repeatTask?: string }> }) {
  const { repeatTask } = await searchParams;
  const [user, categories] = await Promise.all([
    getCurrentUser(),
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, slug: true, name: true, icon: true },
    }),
  ]);
  let repeatPrefill: TaskCreatePrefill | null = null;
  if (user && repeatTask && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(repeatTask)) {
    const task = await prisma.task.findFirst({
      where: { id: repeatTask, customerId: user.id },
      select: {
        id: true,
        categoryId: true,
        title: true,
        description: true,
        priceKopecks: true,
        latitude: true,
        longitude: true,
        addressLabel: true,
        isUrgent: true,
        paymentMethod: true,
        status: true,
        matches: {
          where: { status: "COMPLETED" },
          orderBy: { completedAt: "desc" },
          take: 1,
          select: { performer: { select: { id: true, displayName: true } } },
        },
      },
    });
    if (task && isRepeatableTaskStatus(task.status)) {
      repeatPrefill = {
        repeatOfTaskId: task.id,
        categoryId: task.categoryId,
        title: task.title,
        description: task.description,
        priceRubles: task.priceKopecks % 100 === 0 ? String(task.priceKopecks / 100) : (task.priceKopecks / 100).toFixed(2),
        latitude: Number(task.latitude),
        longitude: Number(task.longitude),
        addressLabel: task.addressLabel ?? "",
        isUrgent: task.isUrgent,
        paymentMethod: task.paymentMethod,
        previousPerformer: task.matches[0]?.performer ?? null,
      };
    }
  }

  return (
    <FeedPage
      apiKey={
        process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY?.includes("placeholder")
          ? ""
          : (process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY ?? "")
      }
      categories={categories}
      repeatPrefill={repeatPrefill}
      user={user ? { displayName: user.displayName, avatarUrl: user.avatarUrl, isAdmin: user.roles.includes("ADMIN"), telegramVerified: Boolean(user.telegramVerifiedAt) } : null}
    />
  );
}
