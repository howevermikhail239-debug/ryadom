import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck, CalendarDays, CheckCircle2, RadioTower, ShieldCheck, Star } from "lucide-react";
import { z } from "zod";

import { UserAvatar } from "@/components/users/user-avatar";
import { UserReviewsList } from "@/components/users/user-reviews-list";
import { FavoritePerformerButton } from "@/components/users/favorite-performer-button";
import { ReportDialog } from "@/components/safety/report-dialog";
import { BlockUserButton } from "@/components/users/block-user-button";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";
const idSchema = z.string().uuid();

export default async function PublicUserPage({ params }: { params: Promise<{ id: string }> }) {
  const parsedId = idSchema.safeParse((await params).id);
  if (!parsedId.success) notFound();
  const [user, currentUser] = await Promise.all([prisma.user.findFirst({
    where: { id: parsedId.data, deletedAt: null, status: { in: ["ACTIVE", "PENDING"] } },
    select: { id: true, displayName: true, avatarUrl: true, bio: true, ratingAverage: true, ratingCount: true, completedTasks: true, telegramVerifiedAt: true, phoneVerifiedAt: true, availableUntil: true, createdAt: true, roles: true },
  }), getCurrentUser()]);
  if (!user) notFound();
  const canFavorite = Boolean(currentUser && currentUser.id !== user.id && user.roles.includes("PERFORMER"));
  const [favorite, blocked] = await Promise.all([
    canFavorite ? prisma.favoritePerformer.findUnique({ where: { customerId_performerId: { customerId: currentUser!.id, performerId: user.id } }, select: { performerId: true } }) : null,
    currentUser && currentUser.id !== user.id ? prisma.userBlock.findUnique({ where: { blockerId_blockedId: { blockerId: currentUser.id, blockedId: user.id } }, select: { blockedId: true } }) : null,
  ]);

  return <main className="mx-auto min-h-dvh max-w-2xl px-4 pb-32 pt-5 sm:px-8">
    <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold shadow-sm dark:bg-stone-900"><ArrowLeft className="size-4" /> Назад</Link>
    <section className="mt-5 rounded-[2rem] border border-stone-200 bg-white p-6 text-center shadow-sm dark:border-stone-800 dark:bg-stone-900">
      <UserAvatar name={user.displayName} avatarUrl={user.avatarUrl} className="mx-auto size-24" />
      <h1 className="mt-4 text-3xl font-black tracking-tight">{user.displayName}</h1>
      <p className="mt-2 flex items-center justify-center gap-1 text-sm text-stone-500"><Star className="size-4 fill-amber-400 text-amber-400" /> {Number(user.ratingAverage).toFixed(1)} · {user.ratingCount} отзывов</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">{user.telegramVerifiedAt && <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-3 py-1.5 text-xs font-bold text-sky-800 dark:bg-sky-950 dark:text-sky-200"><BadgeCheck className="size-4" /> Telegram Verified</span>}{user.phoneVerifiedAt && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"><ShieldCheck className="size-4" /> Телефон подтверждён</span>}{user.availableUntil && user.availableUntil > new Date() && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white"><RadioTower className="size-4" /> Готов к задаче рядом</span>}</div>
      <div className="mt-6 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-stone-100 p-4 dark:bg-stone-800"><CheckCircle2 className="mx-auto size-5 text-emerald-700" /><p className="mt-1 text-2xl font-black">{user.completedTasks}</p><p className="text-xs text-stone-500">Завершено задач</p></div><div className="rounded-2xl bg-stone-100 p-4 dark:bg-stone-800"><CalendarDays className="mx-auto size-5 text-emerald-700" /><p className="mt-1 text-sm font-black">{user.createdAt.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}</p><p className="text-xs text-stone-500">На платформе</p></div></div>
      <div className="mt-5 rounded-2xl bg-stone-50 p-4 text-left dark:bg-stone-950"><p className="text-xs font-black uppercase tracking-wider text-stone-400">О себе</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-700 dark:text-stone-200">{user.bio || "Пользователь пока не добавил описание."}</p></div>
      {canFavorite && <FavoritePerformerButton performerId={user.id} initialFavorite={Boolean(favorite)} />}
      {currentUser && currentUser.id !== user.id && <div className="mt-2"><ReportDialog reportedUserId={user.id} /></div>}
      {currentUser && currentUser.id !== user.id && <BlockUserButton userId={user.id} initialBlocked={Boolean(blocked)} />}
    </section>
    <UserReviewsList userId={user.id} />
  </main>;
}
