import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Flag, ShieldCheck } from "lucide-react";

import { updateReportStatus } from "./actions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const reasonLabels: Record<string, string> = { SPAM: "Спам", FRAUD: "Мошенничество", PROHIBITED: "Запрещённое", ABUSE: "Оскорбления", OTHER: "Другое" };
const statusLabels: Record<string, string> = { OPEN: "Новая", REVIEWED: "Проверена", CLOSED: "Закрыта" };

export default async function AdminReportsPage() {
  const user = await getCurrentUser();
  if (!user?.roles.includes("ADMIN")) notFound();
  const reports = await prisma.report.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      reporter: { select: { id: true, displayName: true } },
      reportedUser: { select: { id: true, displayName: true } },
      task: { select: { id: true, title: true } },
    },
  });

  return <main className="mx-auto min-h-dvh max-w-3xl px-4 pb-12 pt-5 sm:px-8"><Link href="/profile" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold shadow-sm dark:bg-stone-900"><ArrowLeft className="size-4" />Профиль</Link><div className="mt-6"><p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-violet-700 dark:text-violet-300"><ShieldCheck className="size-4" />Только администратор</p><h1 className="mt-1 text-3xl font-black tracking-tight">Жалобы</h1><p className="mt-2 text-sm text-stone-500">Минимальная очередь ручной проверки.</p></div><div className="mt-6 space-y-3">{reports.map((report) => <article key={report.id} className="rounded-3xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900"><div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-black text-red-800 dark:bg-red-950 dark:text-red-200">{reasonLabels[report.reason]}</span><span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-bold dark:bg-stone-800">{statusLabels[report.status]}</span></div><p className="mt-3 text-sm"><span className="text-stone-500">От:</span> <Link href={`/users/${report.reporter.id}`} className="font-bold text-emerald-700 hover:underline dark:text-emerald-300">{report.reporter.displayName}</Link></p>{report.reportedUser ? <p className="mt-1 text-sm"><span className="text-stone-500">На пользователя:</span> <Link href={`/users/${report.reportedUser.id}`} className="font-bold text-emerald-700 hover:underline dark:text-emerald-300">{report.reportedUser.displayName}</Link></p> : null}{report.task ? <p className="mt-1 text-sm"><span className="text-stone-500">На задачу:</span> <Link href={`/tasks/${report.task.id}`} className="font-bold text-emerald-700 hover:underline dark:text-emerald-300">{report.task.title}</Link></p> : null}{report.details ? <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-stone-50 p-3 text-sm leading-6 dark:bg-stone-950">{report.details}</p> : null}<time className="mt-3 block text-xs text-stone-400">{report.createdAt.toLocaleString("ru-RU")}</time>{report.status !== "CLOSED" ? <div className="mt-4 flex flex-wrap gap-2">{report.status === "OPEN" ? <form action={updateReportStatus.bind(null, report.id, "REVIEWED")}><button type="submit" className="min-h-10 rounded-xl bg-violet-100 px-4 text-sm font-bold text-violet-900 dark:bg-violet-950 dark:text-violet-200">Отметить проверенной</button></form> : null}<form action={updateReportStatus.bind(null, report.id, "CLOSED")}><button type="submit" className="min-h-10 rounded-xl bg-stone-200 px-4 text-sm font-bold dark:bg-stone-800">Закрыть</button></form></div> : null}</article>)}{reports.length === 0 ? <div className="rounded-3xl border border-dashed border-stone-300 p-10 text-center dark:border-stone-700"><Flag className="mx-auto size-8 text-stone-400" /><p className="mt-3 font-bold">Жалоб пока нет</p></div> : null}</div></main>;
}
