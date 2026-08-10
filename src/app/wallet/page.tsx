import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowDownLeft, ArrowUpRight, ReceiptText, WalletCards } from "lucide-react";

import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { formatRubles } from "@/lib/utils";

export const dynamic = "force-dynamic";

const kindLabels = { ESCROW_DEPOSIT: "Резервирование", PAYOUT: "Выплата", REFUND: "Возврат" } as const;
const statusLabels = { PENDING: "Ожидает", WAITING_FOR_CAPTURE: "Зарезервировано", SUCCEEDED: "Проведено", CANCELLED: "Отменено", REFUNDED: "Возвращено", FAILED: "Ошибка" } as const;

export default async function WalletPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fwallet");
  const payments = await prisma.payment.findMany({
    where: { OR: [{ payerId: user.id }, { payeeId: user.id }] },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { task: { select: { id: true, title: true } } },
  });

  return <main className="mx-auto min-h-dvh max-w-2xl px-4 pb-32 pt-5 sm:px-8">
    <header><Link href="/profile" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold shadow-sm dark:bg-stone-900"><ArrowLeft className="size-4" /> Профиль</Link><p className="mt-6 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-emerald-700"><WalletCards className="size-4" /> Финансы</p><h1 className="mt-1 text-3xl font-black tracking-tight">Кошелёк</h1><p className="mt-1 text-sm text-stone-500">История оплат, выплат и возвратов по задачам.</p></header>
    {payments.length ? <div className="mt-6 space-y-3">{payments.map((payment) => {
      const incoming = payment.payeeId === user.id;
      const Icon = incoming ? ArrowDownLeft : ArrowUpRight;
      return <article key={payment.id} className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <div className="flex items-start gap-3"><span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${incoming ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200"}`}><Icon className="size-5" /></span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div><p className="font-black">{kindLabels[payment.kind]}</p><p className="mt-0.5 text-xs text-stone-500">{statusLabels[payment.status]}</p></div><p className={`shrink-0 text-lg font-black ${incoming ? "text-emerald-700" : "text-stone-950 dark:text-white"}`}>{incoming ? "+" : "−"}{formatRubles(payment.amountKopecks)}</p></div><Link href={`/tasks/${payment.task.id}`} className="mt-2 block truncate text-sm font-semibold text-emerald-700 hover:underline">{payment.task.title}</Link><time className="mt-1 block text-xs text-stone-400">{payment.createdAt.toLocaleString("ru-RU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</time></div></div>
      </article>;
    })}</div> : <div className="mt-6 rounded-3xl border border-dashed border-stone-300 px-6 py-14 text-center dark:border-stone-700"><ReceiptText className="mx-auto size-9 text-stone-400" /><h2 className="mt-3 font-black">Операций пока нет</h2><p className="mt-1 text-sm text-stone-500">Здесь появятся платежи после использования безопасной сделки.</p></div>}
  </main>;
}
