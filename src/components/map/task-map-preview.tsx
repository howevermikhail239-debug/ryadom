"use client";

import Link from "next/link";
import { BadgeCheck, Clock3, MapPin, X } from "lucide-react";

import { formatFreshness } from "@/lib/map/discovery";
import { formatDistance, formatRubles } from "@/lib/utils";
import type { TaskFeedItem } from "@/types/task";

export function TaskMapPreview({ task, onClose, onOpen }: { task: TaskFeedItem; onClose: () => void; onOpen?: () => void }) {
  return (
    <article className="absolute inset-x-3 bottom-16 z-20 rounded-2xl border border-white/60 bg-white/95 p-4 shadow-2xl backdrop-blur dark:border-stone-700 dark:bg-stone-900/95" aria-label={`Выбрана задача ${task.title}`}>
      <button type="button" onClick={onClose} className="absolute right-2 top-2 grid size-9 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800" aria-label="Закрыть карточку"><X className="size-4" /></button>
      <div className="pr-9">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">{task.category.icon} {task.category.name}</p><h3 className="mt-1 truncate font-black">{task.title}</h3></div><p className="shrink-0 text-xl font-black text-emerald-800 dark:text-emerald-300">{formatRubles(task.priceKopecks)}</p></div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-stone-500 dark:text-stone-300"><span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{formatDistance(task.distanceMeters)}</span><span className="inline-flex items-center gap-1"><Clock3 className="size-3.5" />{formatFreshness(task.publishedAt)}</span>{task.isUrgent ? <span className="text-orange-700 dark:text-orange-300">⚡ Срочно</span> : null}{task.customer.telegramVerified ? <span className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-300"><BadgeCheck className="size-3.5" />Проверенный заказчик</span> : null}</div>
        <Link href={`/tasks/${task.id}`} onClick={onOpen} className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-emerald-950 px-4 text-sm font-black text-white">Открыть задачу</Link>
      </div>
    </article>
  );
}
