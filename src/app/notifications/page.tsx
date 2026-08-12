import { Bell, CheckCheck, Circle, MessageCircle, TimerOff, UserCheck } from "lucide-react";
import { redirect } from "next/navigation";

import { markAllNotificationsRead, markNotificationRead } from "@/app/notifications/actions";
import { Button } from "@/components/ui/button";
import { NotificationLink } from "@/components/notifications/notification-link";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function NotificationIcon({ type }: { type: string }) {
  if (type === "TASK_CHAT_MESSAGE") return <MessageCircle className="size-5" />;
  if (type === "TASK_EXPIRED") return <TimerOff className="size-5" />;
  if (type.startsWith("MATCH_")) return <UserCheck className="size-5" />;
  return <Bell className="size-5" />;
}

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/notifications");

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, taskId: true, type: true, title: true, body: true, readAt: true, createdAt: true },
  });
  const hasUnread = notifications.some((notification) => !notification.readAt);

  return <main className="mx-auto min-h-screen max-w-2xl px-4 pb-28 pt-6">
    <header className="mb-5 flex items-center justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">Рядом</p><h1 className="text-2xl font-black">Уведомления</h1></div>
      {hasUnread && <form action={markAllNotificationsRead}><Button type="submit" variant="outline" size="sm"><CheckCheck className="size-4" /> Прочитать все</Button></form>}
    </header>

    {notifications.length === 0 ? <section className="rounded-3xl border border-dashed border-stone-300 p-8 text-center dark:border-stone-700"><Bell className="mx-auto mb-3 size-8 text-stone-400" /><h2 className="font-bold">Здесь появятся важные события</h2><p className="mt-1 text-sm text-stone-500">Отклики, сообщения, статусы и окончание срока задач.</p></section> : <ul className="space-y-3">
      {notifications.map((notification) => {
        const content = <div className="flex gap-3"><span className={`grid size-10 shrink-0 place-items-center rounded-2xl ${notification.readAt ? "bg-stone-100 text-stone-500 dark:bg-stone-800" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"}`}><NotificationIcon type={notification.type} /></span><span className="min-w-0 flex-1"><span className="flex items-start justify-between gap-2"><strong className="text-sm">{notification.title}</strong>{!notification.readAt && <Circle className="mt-1 size-2 fill-emerald-500 text-emerald-500" />}</span><span className="mt-1 block text-sm leading-5 text-stone-600 dark:text-stone-300">{notification.body}</span><span className="mt-2 block text-xs text-stone-400">{dateFormatter.format(notification.createdAt)}</span></span></div>;
        return <li key={notification.id} className={`rounded-3xl border p-4 ${notification.readAt ? "border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900" : "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30"}`}>
          {notification.taskId ? <NotificationLink notificationId={notification.id} taskId={notification.taskId}>{content}</NotificationLink> : content}
          {!notification.readAt && <form action={markNotificationRead.bind(null, notification.id)} className="mt-3 flex justify-end"><button type="submit" className="min-h-10 px-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">Отметить прочитанным</button></form>}
        </li>;
      })}
    </ul>}
  </main>;
}
