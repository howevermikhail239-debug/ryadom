import Link from "next/link";
import { ArrowLeft, ClipboardList } from "lucide-react";

import { AccountMenu } from "@/components/auth/account-menu";
import { TaskCard } from "@/components/tasks/task-card";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import type { TaskFeedItem } from "@/types/task";

export const dynamic = "force-dynamic";

export default async function AllTasksPage() {
  const user = await getCurrentUser();
  const tasks = await prisma.task.findMany({
      where: user?.roles.includes("ADMIN")
        ? {}
        : { OR: [
            { status: { in: ["PUBLISHED", "MATCHING"] }, expiresAt: { gt: new Date() } },
            ...(user ? [{ customerId: user.id }] : []),
          ] },
      orderBy: [{ isUrgent: "desc" }, { publishedAt: "desc" }],
      include: { category: true, customer: { select: { id: true, displayName: true, avatarUrl: true, ratingAverage: true, ratingCount: true, telegramVerifiedAt: true } }, matches: { where: { status: { in: ["CREATED", "CONFIRMED", "IN_PROGRESS", "COMPLETED"] } }, orderBy: { createdAt: "desc" }, take: 1, select: { status: true } } },
  });

  const items: TaskFeedItem[] = tasks.map((task) => ({
    id: task.id,
    title: task.title,
    description: task.description,
    priceKopecks: task.priceKopecks,
    latitude: Number(task.latitude),
    longitude: Number(task.longitude),
    addressLabel: task.addressLabel,
    startsAt: task.startsAt?.toISOString() ?? null,
    expiresAt: task.expiresAt.toISOString(),
    status: task.status,
    distanceMeters: null,
    isUrgent: task.isUrgent,
    paymentMethod: task.paymentMethod,
    awaitingConfirmation: task.status === "IN_PROGRESS" && task.matches[0]?.status === "COMPLETED",
    category: { slug: task.category.slug, name: task.category.name, icon: task.category.icon },
    customer: { id: task.customer.id, displayName: task.customer.displayName, avatarUrl: task.customer.avatarUrl, ratingAverage: Number(task.customer.ratingAverage), ratingCount: task.customer.ratingCount, telegramVerified: Boolean(task.customer.telegramVerifiedAt) },
  }));

  return (
    <main className="mx-auto min-h-dvh max-w-5xl px-4 pb-32 pt-5 sm:px-8">
      <header className="mb-8 flex items-center justify-between gap-3">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold shadow-sm dark:bg-stone-900"><ArrowLeft className="size-4" /> Карта</Link>
        <div className="flex items-center gap-2"><ThemeToggle />{user && <AccountMenu user={{ displayName: user.displayName, avatarUrl: user.avatarUrl, isAdmin: user.roles.includes("ADMIN"), telegramVerified: Boolean(user.telegramVerifiedAt) }} />}</div>
      </header>
      <div className="mb-6">
        <p className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700"><ClipboardList className="size-4" /> Общий каталог</p>
        <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{user?.roles.includes("ADMIN") ? "Все задачи" : "Задачи сервиса"}</h1>
        <p className="mt-2 text-sm text-stone-500">{user?.roles.includes("ADMIN") ? "Полный реестр для администратора" : "Активные задачи и созданные вами"} · {items.length} задач</p>
      </div>
      {items.length ? <div className="grid gap-3 md:grid-cols-2">{items.map((task) => <TaskCard key={task.id} task={task} />)}</div> : <div className="rounded-3xl border border-dashed border-stone-300 p-10 text-center text-stone-500 dark:border-stone-700">Активных задач пока нет.</div>}
    </main>
  );
}
