import Link from "next/link";
import { CalendarDays, MapPinned, MessageCircle } from "lucide-react";

import { formatRubles } from "@/lib/utils";
import type { MyTaskItem } from "@/types/my-task";

const statusLabels: Record<MyTaskItem["status"], string> = {
  DRAFT: "Черновик",
  PUBLISHED: "Ищет исполнителя",
  MATCHING: "Поиск",
  ASSIGNED: "Исполнитель найден",
  IN_PROGRESS: "В работе",
  COMPLETED: "Завершена",
  CANCELLED: "Отменена",
  EXPIRED: "Срок истёк",
  DISPUTED: "Спор",
};

function statusClass(task: MyTaskItem) {
  if (task.awaitingConfirmation) return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200";
  if (task.status === "COMPLETED") return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200";
  if (["CANCELLED", "EXPIRED"].includes(task.status)) return "bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300";
  if (task.status === "DISPUTED") return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200";
  return "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200";
}

export function MyTaskCard({ task }: { task: MyTaskItem }) {
  const date = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" }).format(new Date(task.updatedAt));
  const isWorking = ["ASSIGNED", "IN_PROGRESS"].includes(task.status) && task.matchStatus !== "CANCELLED";
  const routeUrl = `https://yandex.ru/maps/?rtext=~${task.latitude},${task.longitude}&rtt=pd`;

  return (
    <article className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm transition hover:border-emerald-300 dark:border-stone-800 dark:bg-stone-900">
      <Link href={`/tasks/${task.id}`} className="block min-h-28 p-4 active:bg-stone-50 dark:active:bg-stone-800">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="line-clamp-2 font-bold leading-snug text-stone-950 dark:text-stone-50">{task.title}</h2>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-stone-500"><CalendarDays className="size-3.5" /> Обновлена {date}</p>
          </div>
          <p className="shrink-0 text-lg font-black text-emerald-800 dark:text-emerald-300">{formatRubles(task.priceKopecks + task.tipAmount)}</p>
        </div>
        <span className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusClass(task)}`}>{task.awaitingConfirmation ? "На подтверждении" : statusLabels[task.status]}</span>
      </Link>

      {isWorking && (
        <div className="flex gap-2 border-t border-stone-100 p-3 dark:border-stone-800">
          <Link href={`/tasks/${task.id}#chat`} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-stone-900 px-4 text-sm font-bold text-white dark:bg-stone-100 dark:text-stone-950"><MessageCircle className="size-4" /> Открыть чат</Link>
          {task.role === "performer" && <a href={routeUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-stone-300 px-4 text-sm font-bold dark:border-stone-700"><MapPinned className="size-4" /> Маршрут</a>}
        </div>
      )}
    </article>
  );
}
