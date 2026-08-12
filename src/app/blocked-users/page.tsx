import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Ban } from "lucide-react";

import { BlockUserButton } from "@/components/users/block-user-button";
import { UserAvatar } from "@/components/users/user-avatar";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export default async function BlockedUsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fblocked-users");
  const blocks = await prisma.userBlock.findMany({
    where: { blockerId: user.id },
    orderBy: { createdAt: "desc" },
    include: { blocked: { select: { id: true, displayName: true, avatarUrl: true } } },
  });

  return <main className="mx-auto min-h-dvh max-w-2xl px-4 pb-12 pt-5 sm:px-8"><Link href="/profile" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold shadow-sm dark:bg-stone-900"><ArrowLeft className="size-4" />Профиль</Link><div className="mt-6"><p className="text-xs font-black uppercase tracking-wider text-red-600 dark:text-red-300">Безопасность</p><h1 className="mt-1 text-3xl font-black tracking-tight">Заблокированные</h1><p className="mt-2 text-sm text-stone-500">Эти пользователи не смогут матчиться с вами или писать в чат.</p></div><div className="mt-6 space-y-3">{blocks.map(({ blocked }) => <article key={blocked.id} className="rounded-3xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900"><div className="flex items-center gap-3"><UserAvatar name={blocked.displayName} avatarUrl={blocked.avatarUrl} /><p className="font-black">{blocked.displayName}</p></div><BlockUserButton userId={blocked.id} initialBlocked /></article>)}{blocks.length === 0 ? <div className="rounded-3xl border border-dashed border-stone-300 p-10 text-center dark:border-stone-700"><Ban className="mx-auto size-8 text-stone-400" /><p className="mt-3 font-bold">Список пуст</p><p className="mt-1 text-sm text-stone-500">Заблокировать человека можно в его профиле.</p></div> : null}</div></main>;
}
