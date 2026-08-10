import Link from "next/link";
import { MessageCircle, Star } from "lucide-react";

import { UserAvatar } from "@/components/users/user-avatar";
import { prisma } from "@/lib/db/prisma";

const reactionLabels: Record<string, string> = { GREAT: "😍 Отлично", OK: "🙂 Нормально", BAD: "😕 Плохо" };
const tagLabels: Record<string, string> = { FAST: "Быстро", POLITE: "Вежливо", ON_TIME: "Вовремя", QUALITY: "Качественно" };

export async function UserReviewsList({ userId, limit = 30 }: { userId: string; limit?: number }) {
  const reviews = await prisma.review.findMany({
    where: { recipientId: userId, author: { deletedAt: null } },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 50),
    include: {
      author: { select: { id: true, displayName: true, avatarUrl: true } },
      match: { select: { task: { select: { id: true, title: true } } } },
    },
  });

  return <section className="mt-5 rounded-3xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
    <h2 className="flex items-center gap-2 text-lg font-black"><MessageCircle className="size-5 text-emerald-700" /> Отзывы <span className="text-sm font-medium text-stone-400">{reviews.length}</span></h2>
    {reviews.length ? <div className="mt-4 space-y-4">{reviews.map((review) => <article key={review.id} className="border-b border-stone-100 pb-4 last:border-0 last:pb-0 dark:border-stone-800">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/users/${review.author.id}`} className="flex min-w-0 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"><UserAvatar name={review.author.displayName} avatarUrl={review.author.avatarUrl} className="size-10" /><span className="min-w-0"><span className="block truncate text-sm font-bold">{review.author.displayName}</span><time className="block text-xs text-stone-400">{review.createdAt.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}</time></span></Link>
        <span className="flex shrink-0 items-center gap-1 text-sm font-black text-amber-600"><Star className="size-4 fill-amber-400 text-amber-400" />{review.rating}</span>
      </div>
      <p className="mt-3 text-sm font-bold">{reactionLabels[review.reaction] ?? review.reaction}</p>
      {review.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{review.tags.map((tag) => <span key={tag} className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">{tagLabels[tag] ?? tag}</span>)}</div>}
      {review.comment && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-600 dark:text-stone-300">{review.comment}</p>}
      <Link href={`/tasks/${review.match.task.id}`} className="mt-2 block truncate text-xs font-semibold text-emerald-700 hover:underline">Задача: {review.match.task.title}</Link>
    </article>)}</div> : <div className="mt-4 rounded-2xl bg-stone-50 px-4 py-8 text-center text-sm text-stone-500 dark:bg-stone-950">Отзывов пока нет. Они появятся после завершённых задач.</div>}
  </section>;
}
