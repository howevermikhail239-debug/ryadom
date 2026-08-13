import Link from "next/link";
import { BadgeCheck, Banknote, Clock3, LocateFixed, MapPin, Star } from "lucide-react";

import { TimeUntil } from "@/components/tasks/time-until";
import { UrgentCountdown } from "@/components/tasks/urgent-countdown";
import { Card, CardContent } from "@/components/ui/card";
import { UserAvatar } from "@/components/users/user-avatar";
import { isTaskAvailableStatus } from "@/lib/tasks/policy";
import { formatDistance, formatRubles } from "@/lib/utils";
import type { TaskFeedItem } from "@/types/task";

export function TaskCard({ task, selected = false, onShowOnMap }: { task: TaskFeedItem; selected?: boolean; onShowOnMap?: () => void }) {
  const statusLabels: Partial<Record<TaskFeedItem["status"], string>> = { DRAFT: "Черновик", ASSIGNED: "Исполнитель найден", IN_PROGRESS: "В работе", COMPLETED: "Выполнено", CANCELLED: "Отменено", EXPIRED: "Срок истёк", DISPUTED: "Спор" };
  return <Card className={`overflow-hidden transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md ${selected ? "border-emerald-500 ring-2 ring-emerald-500/20" : ""}`}>
    <Link href={`/tasks/${task.id}`} className="block rounded-t-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600">
      <CardContent>
        <div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="mb-2 flex flex-wrap items-center gap-2"><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-900">{task.category.icon} {task.category.name}</span>{task.isUrgent && isTaskAvailableStatus(task.status) && <UrgentCountdown expiresAt={task.expiresAt} />}{(task.awaitingConfirmation || statusLabels[task.status]) && <span className="rounded-full bg-stone-200 px-2.5 py-1 text-xs font-bold text-stone-700 dark:bg-stone-700 dark:text-stone-200">{task.awaitingConfirmation ? "На подтверждении" : statusLabels[task.status]}</span>}</div><h3 className="text-lg font-extrabold leading-snug text-stone-950 dark:text-stone-50">{task.title}</h3></div><p className="shrink-0 text-xl font-black tracking-tight text-emerald-950 dark:text-emerald-300">{formatRubles(task.priceKopecks)}</p></div>
        <p className="mt-3 line-clamp-2 text-sm leading-6 text-stone-600 dark:text-stone-300">{task.description}</p>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-stone-500"><span className="flex items-center gap-1"><MapPin className="size-4 text-emerald-700" />{formatDistance(task.distanceMeters)}</span><span className="flex items-center gap-1"><Clock3 className="size-4 text-orange-500" /><TimeUntil startsAt={task.startsAt} /></span>{task.addressLabel && <span className="flex items-center gap-1"><MapPin className="size-4 text-emerald-700" />Адрес указан</span>}<span className="flex items-center gap-1"><Banknote className="size-4 text-emerald-700" />{task.paymentMethod === "CASH" ? "Наличные" : "Перевод"}</span></div>
      </CardContent>
    </Link>
    <div className="flex items-center gap-2 border-t border-stone-100 px-5 py-3 dark:border-stone-800"><Link href={`/users/${task.customer.id}`} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"><UserAvatar name={task.customer.displayName} avatarUrl={task.customer.avatarUrl} className="size-9" /><span className="min-w-0"><span className="flex items-center gap-1 truncate text-sm font-bold">{task.customer.displayName}{task.customer.telegramVerified && <BadgeCheck className="size-4 shrink-0 text-sky-600" />}</span><span className="flex items-center gap-1 text-xs text-stone-500"><Star className="size-3.5 fill-amber-400 text-amber-400" />{task.customer.ratingCount ? task.customer.ratingAverage.toFixed(1) : "Новый профиль"}</span></span></Link>{onShowOnMap ? <button type="button" onClick={onShowOnMap} className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-xl bg-emerald-50 px-3 text-xs font-black text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"><LocateFixed className="size-4" />На карте</button> : <Link href={`/users/${task.customer.id}`} className="text-xs font-bold text-emerald-700">Профиль</Link>}</div>
  </Card>;
}
