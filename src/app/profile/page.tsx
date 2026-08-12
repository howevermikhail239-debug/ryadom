import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, Ban, BriefcaseBusiness, Heart, MapPin, ShieldCheck, Star, UsersRound, WalletCards } from "lucide-react";

import { EditProfileModal } from "@/components/profile/edit-profile-modal";
import { AvailabilityControl } from "@/components/profile/availability-control";
import { ProfileActions } from "@/components/profile/profile-actions";
import { NotificationPreferences } from "@/components/profile/notification-preferences";
import { UserAvatar } from "@/components/users/user-avatar";
import { UserReviewsList } from "@/components/users/user-reviews-list";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fprofile");
  const isAdmin = user.roles.includes("ADMIN");
  const [createdCount, performedCount, favoritePlaces, categories, notificationPreference] = await Promise.all([
    prisma.task.count({ where: { customerId: user.id } }),
    prisma.taskMatch.count({ where: { performerId: user.id, status: "COMPLETED" } }),
    prisma.favoritePlace.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, addressLabel: true } }),
    prisma.category.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, slug: true, name: true, icon: true } }),
    prisma.notificationPreference.findUnique({ where: { userId: user.id }, include: { categories: { select: { categoryId: true } } } }),
  ]);

  return <main className="mx-auto min-h-dvh max-w-2xl px-4 pb-32 pt-5 sm:px-8">
    <header className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center"><div><p className="text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Аккаунт</p><h1 className="text-3xl font-black tracking-tight">Профиль</h1></div><ProfileActions /></header>

    <section className="mt-5 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900">
      <div className="flex items-center gap-4"><UserAvatar name={user.displayName} avatarUrl={user.avatarUrl} className="size-16" /><div className="min-w-0 flex-1"><h2 className="truncate text-xl font-black">{user.displayName}</h2><p className="mt-1 flex items-center gap-1 text-sm text-stone-500"><Star className="size-4 fill-amber-400 text-amber-400" /> {Number(user.ratingAverage).toFixed(1)} · {user.ratingCount} отзывов</p></div></div>
      <div className="mt-4 flex flex-wrap gap-2">{user.telegramVerifiedAt && <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-bold text-sky-800 dark:bg-sky-950 dark:text-sky-200"><BadgeCheck className="size-3.5" /> Telegram Verified</span>}{user.phoneVerifiedAt && <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-bold dark:bg-stone-800"><BadgeCheck className="size-3.5" /> Телефон подтверждён</span>}{isAdmin && <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-800 dark:bg-violet-950 dark:text-violet-200"><ShieldCheck className="size-3.5" /> Администратор</span>}</div>
      <div className="mt-5 rounded-2xl bg-stone-50 p-4 dark:bg-stone-950"><p className="text-xs font-black uppercase tracking-wider text-stone-400">О себе</p>{user.bio ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-700 dark:text-stone-200">{user.bio}</p> : <p className="mt-2 text-sm font-semibold text-amber-700 dark:text-amber-300">Добавьте описание, чтобы заказчики доверяли вам больше.</p>}<div className="mt-3"><EditProfileModal displayName={user.displayName} bio={user.bio} /></div></div>
      <div className="mt-5 grid grid-cols-3 gap-2 text-center"><div className="rounded-2xl bg-stone-100 p-3 dark:bg-stone-800"><p className="text-xl font-black">{createdCount}</p><p className="text-[11px] text-stone-500">Создано</p></div><div className="rounded-2xl bg-stone-100 p-3 dark:bg-stone-800"><p className="text-xl font-black">{performedCount}</p><p className="text-[11px] text-stone-500">Выполнено</p></div><div className="rounded-2xl bg-stone-100 p-3 dark:bg-stone-800"><p className="text-xl font-black">{user.completedTasks}</p><p className="text-[11px] text-stone-500">Всего</p></div></div>
    </section>

    {user.roles.includes("PERFORMER") && <AvailabilityControl initialUntil={user.availableUntil?.toISOString() ?? null} initialActive={Boolean(user.availableUntil && user.availableUntil > new Date())} />}

    {user.roles.includes("PERFORMER") && <NotificationPreferences categories={categories} initial={{ nearbyEnabled: notificationPreference?.nearbyEnabled ?? true, radiusMeters: notificationPreference?.radiusMeters ?? 1000, categoryIds: notificationPreference?.categories.map((item) => item.categoryId) ?? [], quietHoursStart: notificationPreference?.quietHoursStart ?? null, quietHoursEnd: notificationPreference?.quietHoursEnd ?? null }} />}

    <Link href="/wallet" className="mt-4 flex min-h-16 items-center gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 px-5 font-black text-emerald-950 transition hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"><WalletCards className="size-6" /><span>Кошелёк и история операций</span><span className="ml-auto text-xl" aria-hidden="true">›</span></Link>
    <Link href="/favorites" className="mt-3 flex min-h-16 items-center gap-3 rounded-3xl border border-rose-200 bg-rose-50 px-5 font-black text-rose-950 transition hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-100"><Heart className="size-6" /><span>Избранные исполнители</span><span className="ml-auto text-xl" aria-hidden="true">›</span></Link>
    <Link href="/blocked-users" className="mt-3 flex min-h-14 items-center gap-3 rounded-3xl border border-stone-200 bg-white px-5 font-bold transition hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-900"><Ban className="size-5 text-red-600 dark:text-red-300" /><span>Заблокированные</span><span className="ml-auto text-xl" aria-hidden="true">›</span></Link>

    <section className="mt-4 rounded-3xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900"><h2 className="flex items-center gap-2 font-black"><MapPin className="size-5 text-emerald-700" /> Сохранённые места</h2><p className="mt-1 text-sm text-stone-500">«Дом» используется для быстрого создания задач по домашнему адресу.</p>{favoritePlaces.length ? <div className="mt-3 space-y-2">{favoritePlaces.map((place) => <div key={place.id} className="rounded-2xl bg-stone-100 px-4 py-3 dark:bg-stone-800"><p className="font-bold">{place.name}</p>{place.addressLabel && <p className="mt-0.5 truncate text-xs text-stone-500">{place.addressLabel}</p>}</div>)}</div> : <p className="mt-3 text-sm text-stone-500">Сохраните «Дом» или «Работу» при создании задачи — они появятся здесь.</p>}</section>

    {isAdmin && <section className="mt-4 rounded-3xl border border-violet-200 bg-violet-50 p-5 dark:border-violet-900 dark:bg-violet-950/40"><h2 className="flex items-center gap-2 font-black"><ShieldCheck className="size-5" /> Управление</h2><div className="mt-3 grid gap-2 sm:grid-cols-2"><Link href="/tasks" className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-stone-300 bg-white px-4 text-sm font-bold dark:border-stone-700 dark:bg-stone-900"><BriefcaseBusiness className="size-4" /> Все задачи</Link><Link href="/admin/reports" className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-stone-300 bg-white px-4 text-sm font-bold dark:border-stone-700 dark:bg-stone-900"><ShieldCheck className="size-4" /> Жалобы</Link><Link href="/test-login" className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-stone-300 bg-white px-4 text-sm font-bold dark:border-stone-700 dark:bg-stone-900"><UsersRound className="size-4" /> Тестовый пользователь</Link></div></section>}

    <UserReviewsList userId={user.id} />
  </main>;
}
