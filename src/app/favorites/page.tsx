import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BadgeCheck, Heart, Star } from "lucide-react";

import { FavoritePerformerButton } from "@/components/users/favorite-performer-button";
import { UserAvatar } from "@/components/users/user-avatar";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export default async function FavoritesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Ffavorites");
  const favorites = await prisma.favoritePerformer.findMany({
    where: { customerId: user.id, performer: { deletedAt: null, status: "ACTIVE" } },
    orderBy: { createdAt: "desc" },
    include: { performer: { select: { id: true, displayName: true, avatarUrl: true, ratingAverage: true, ratingCount: true, completedTasks: true, telegramVerifiedAt: true } } },
  });

  return <main className="mx-auto min-h-dvh max-w-2xl px-4 pb-32 pt-5 sm:px-8">
    <Link href="/profile" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold shadow-sm dark:bg-stone-900"><ArrowLeft className="size-4" /> Профиль</Link>
    <div className="mt-6"><p className="text-xs font-black uppercase tracking-wider text-rose-600">Ваш круг доверия</p><h1 className="mt-1 text-3xl font-black tracking-tight">Избранные исполнители</h1><p className="mt-2 text-sm text-stone-500">Сохранённые профили без прямого назначения задач.</p></div>
    <div className="mt-6 space-y-3">{favorites.map(({ performer }) => <article key={performer.id} className="rounded-3xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900"><Link href={`/users/${performer.id}`} className="flex items-center gap-3"><UserAvatar name={performer.displayName} avatarUrl={performer.avatarUrl} className="size-14" /><div className="min-w-0 flex-1"><h2 className="truncate font-black">{performer.displayName}</h2><p className="mt-1 flex items-center gap-1 text-xs text-stone-500"><Star className="size-3.5 fill-amber-400 text-amber-400" /> {performer.ratingCount ? Number(performer.ratingAverage).toFixed(1) : "Новый профиль"} · {performer.completedTasks} выполнено</p>{performer.telegramVerifiedAt && <p className="mt-1 flex items-center gap-1 text-xs font-bold text-sky-700"><BadgeCheck className="size-3.5" /> Telegram Verified</p>}</div></Link><FavoritePerformerButton performerId={performer.id} initialFavorite /></article>)}{favorites.length === 0 && <div className="rounded-3xl border border-dashed border-stone-300 p-10 text-center dark:border-stone-700"><Heart className="mx-auto size-8 text-stone-400" /><p className="mt-3 font-bold">Пока никого нет</p><p className="mt-1 text-sm text-stone-500">Добавьте понравившегося исполнителя после задачи или из его профиля.</p></div>}</div>
  </main>;
}
