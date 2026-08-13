import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { ArrowLeft, BadgeCheck, Banknote, Clock3, MapPin, Navigation, Pencil, Repeat2, ShieldCheck, Star } from "lucide-react";

import { LazyYandexMap } from "@/components/map/lazy-yandex-map";
import { DeleteTaskButton } from "@/components/tasks/delete-task-button";
import { FastMatchButton } from "@/components/tasks/fast-match-button";
import { TaskWorkflowButton } from "@/components/tasks/task-workflow-button";
import { TelegramShareButton } from "@/components/tasks/telegram-share-button";
import { TaskChat } from "@/components/tasks/task-chat";
import { WithdrawTaskButton } from "@/components/tasks/withdraw-task-button";
import { ReviewDialog } from "@/components/tasks/review-dialog";
import { TimeUntil } from "@/components/tasks/time-until";
import { EtaControl } from "@/components/tasks/eta-control";
import { EarlyAccessNotice } from "@/components/tasks/early-access-notice";
import { Card, CardContent } from "@/components/ui/card";
import { UserAvatar } from "@/components/users/user-avatar";
import { FavoritePerformerButton } from "@/components/users/favorite-performer-button";
import { ReportDialog } from "@/components/safety/report-dialog";
import { trackProductEvent } from "@/lib/analytics/events";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { remainingEtaMinutes } from "@/lib/tasks/eta";
import { canSeeExactTaskLocation, isRepeatableTaskStatus, isTaskManageableStatus, VISIBLE_MATCH_STATUSES } from "@/lib/tasks/policy";
import { formatRubles } from "@/lib/utils";
import type { TaskFeedItem } from "@/types/task";

export const dynamic = "force-dynamic";

const statusLabels: Record<string, string> = {
  DRAFT: "Черновик",
  PUBLISHED: "Ищет исполнителя",
  MATCHING: "Идёт матчинг",
  ASSIGNED: "Исполнитель найден",
  IN_PROGRESS: "В работе",
  COMPLETED: "Выполнено",
  CANCELLED: "Отменено",
  EXPIRED: "Срок истёк",
  DISPUTED: "Спор",
};

function distanceMeters(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
) {
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(second.latitude - first.latitude);
  const longitudeDelta = toRadians(second.longitude - first.longitude);
  const firstLatitude = toRadians(first.latitude);
  const secondLatitude = toRadians(second.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export default async function TaskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ review?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [task, currentUser] = await Promise.all([
    prisma.task.findUnique({
      where: { id },
      include: {
        category: true,
        customer: { select: { id: true, displayName: true, avatarUrl: true, ratingAverage: true, ratingCount: true, telegramVerifiedAt: true } },
        matches: {
          where: { status: { in: [...VISIBLE_MATCH_STATUSES] } },
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { bid: { select: { etaMinutes: true, updatedAt: true } }, performer: { select: { id: true, displayName: true, avatarUrl: true, ratingAverage: true, ratingCount: true, telegramVerifiedAt: true, location: { select: { latitude: true, longitude: true, expiresAt: true } } } }, reviews: { select: { id: true, authorId: true, rating: true, reaction: true, tags: true, comment: true, createdAt: true }, orderBy: { createdAt: "asc" } } },
        },
        messages: { where: { imageUrl: { not: null } }, select: { senderId: true }, take: 100 },
      },
    }),
    getCurrentUser(),
  ]);
  if (!task) notFound();

  const match = task.matches[0];
  const available = ["PUBLISHED", "MATCHING"].includes(task.status) && task.expiresAt > new Date();
  const isOwner = currentUser?.id === task.customerId;
  const isAdmin = currentUser?.roles.includes("ADMIN") ?? false;
  const isPerformer = Boolean(currentUser && match && currentUser.id === match.performerId);
  const earlyAccessActive = Boolean(task.earlyAccessUntil && task.earlyAccessUntil > new Date());
  const availableForCurrentUser = available && (!earlyAccessActive || currentUser?.id === task.preferredPerformerId);
  const canSeeExactLocation = canSeeExactTaskLocation({ currentUserId: currentUser?.id, customerId: task.customerId, performerId: match?.performerId, isAdmin });
  const displayLatitude = canSeeExactLocation ? Number(task.latitude) : Math.round(Number(task.latitude) * 1000) / 1000;
  const displayLongitude = canSeeExactLocation ? Number(task.longitude) : Math.round(Number(task.longitude) * 1000) / 1000;
  const displayAddress = canSeeExactLocation ? task.addressLabel : task.addressLabel ? "Точный адрес после взятия задачи" : null;
  const awaitingConfirmation = task.status === "IN_PROGRESS" && match?.status === "COMPLETED";
  const performerCanComplete = Boolean(isPerformer && ["ASSIGNED", "IN_PROGRESS"].includes(task.status) && ["CREATED", "IN_PROGRESS"].includes(match?.status ?? ""));
  const hasPerformerProof = Boolean(match && task.messages.some((message) => message.senderId === match.performerId));
  const ownerCanConfirm = Boolean((isOwner || isAdmin) && awaitingConfirmation);
  const performerLocation = match?.performer.location;
  const isLocalPerformer = Boolean(
    performerLocation
    && performerLocation.expiresAt > new Date()
    && distanceMeters(
      { latitude: Number(task.latitude), longitude: Number(task.longitude) },
      { latitude: Number(performerLocation.latitude), longitude: Number(performerLocation.longitude) },
    ) <= task.searchRadiusMeters,
  );
  const isParticipant = Boolean(currentUser && (isOwner || isPerformer));
  const hasReviewed = Boolean(currentUser && match?.reviews.some((review) => review.authorId === currentUser.id));
  const etaRemaining = remainingEtaMinutes(match?.bid?.etaMinutes ?? null, match?.bid?.updatedAt ?? null);
  const timeline = [
    task.publishedAt && ["Опубликована", task.publishedAt],
    match?.acceptedAt && ["Исполнитель взял задачу", match.acceptedAt],
    match?.startedAt && ["В работе", match.startedAt],
    match?.completedAt && ["Работа отправлена на подтверждение", match.completedAt],
    task.completedAt && ["Выполнение подтверждено", task.completedAt],
  ].filter((item): item is [string, Date] => Boolean(item));
  const canManage = isAdmin || Boolean(isOwner && isTaskManageableStatus(task.status));
  const favoritePerformer = isOwner && match && task.status === "COMPLETED"
    ? await prisma.favoritePerformer.findUnique({ where: { customerId_performerId: { customerId: currentUser!.id, performerId: match.performerId } }, select: { performerId: true } })
    : null;
  after(() => trackProductEvent({ name: "task_viewed", userId: currentUser?.id, taskId: task.id, properties: { status: task.status } }));
  const mapTask: TaskFeedItem = {
    id: task.id,
    title: task.title,
    description: task.description,
    priceKopecks: task.priceKopecks,
    latitude: displayLatitude,
    longitude: displayLongitude,
    addressLabel: displayAddress,
    startsAt: task.startsAt?.toISOString() ?? null,
    publishedAt: task.publishedAt?.toISOString() ?? task.createdAt.toISOString(),
    expiresAt: task.expiresAt.toISOString(),
    status: task.status,
    distanceMeters: 0,
    isUrgent: task.isUrgent,
    paymentMethod: task.paymentMethod,
    category: { slug: task.category.slug, name: task.category.name, icon: task.category.icon },
    customer: {
      id: task.customer.id,
      displayName: task.customer.displayName,
      avatarUrl: task.customer.avatarUrl,
      ratingAverage: Number(task.customer.ratingAverage),
      ratingCount: task.customer.ratingCount,
      telegramVerified: Boolean(task.customer.telegramVerifiedAt),
    },
  };
  const taskUrl = new URL(`/tasks/${task.id}`, process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").toString();
  const shareText = `${task.isUrgent ? "⚡ Срочная задача" : "Задача рядом"}: «${task.title}» — ${formatRubles(task.priceKopecks)}. Можно взять в один тап.`;
  const telegramShareUrl = `https://t.me/share/url?url=${encodeURIComponent(taskUrl)}&text=${encodeURIComponent(shareText)}`;

  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-4 pb-56 pt-5 sm:px-8">
      <div className="mb-5 flex items-center justify-between">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold shadow-sm"><ArrowLeft className="size-4" />Назад</Link>
        <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${available ? "bg-emerald-100 text-emerald-900" : "bg-stone-200 text-stone-700"}`}>
          {awaitingConfirmation ? "Ожидает подтверждения" : (statusLabels[task.status] ?? task.status)}
        </span>
      </div>

      <section className="rounded-[2rem] bg-emerald-950 p-6 text-white shadow-xl shadow-emerald-950/15 sm:p-8">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm font-bold text-emerald-200"><span className="rounded-full bg-white/10 px-3 py-1.5">{task.category.icon} {task.category.name}</span>{task.isUrgent && <span className="rounded-full bg-orange-500 px-3 py-1.5 text-white">Срочно</span>}</div>
        <h1 className="text-3xl font-black leading-tight tracking-[-0.04em] sm:text-4xl">{task.title}</h1>
        <p className="mt-5 text-4xl font-black tracking-tight text-emerald-300">{formatRubles(task.priceKopecks)}</p>
        {task.tipAmount > 0 && <p className="mt-1 text-sm font-bold text-amber-300">+ {formatRubles(task.tipAmount)} чаевых</p>}
        <div className="mt-5 flex flex-wrap gap-4 text-sm text-emerald-100">
          <span className="flex items-center gap-1.5"><Clock3 className="size-4" /><TimeUntil startsAt={task.startsAt?.toISOString() ?? null} /></span>
          <span className="flex items-center gap-1.5"><MapPin className="size-4" />{displayAddress ?? "Точка на карте"}</span>
          <span className="flex items-center gap-1.5"><Banknote className="size-4" />{task.paymentMethod === "CASH" ? "Наличные" : "Перевод"}</span>
        </div>
        <TelegramShareButton shareUrl={telegramShareUrl} />
        {currentUser && !isOwner && <div className="mt-2 [&_button]:text-emerald-200"><ReportDialog taskId={task.id} /></div>}
      </section>

      <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_280px]">
        <div className="space-y-5">
          <Card><CardContent><h2 className="mb-3 text-lg font-black">Что нужно сделать</h2><p className="whitespace-pre-wrap text-sm leading-7 text-stone-700">{task.description}</p></CardContent></Card>
          <div>
            <h2 className="mb-3 text-lg font-black">Место</h2>
            <LazyYandexMap
              apiKey={process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY ?? ""}
              center={{ latitude: displayLatitude, longitude: displayLongitude }}
              tasks={[mapTask]}
              className="h-72"
            />
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <CardContent>
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-stone-400">Заказчик</p>
              <Link href={`/users/${task.customer.id}`} className="flex items-center gap-3 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
                <UserAvatar name={task.customer.displayName} avatarUrl={task.customer.avatarUrl} />
                <div><p className="font-bold">{task.customer.displayName}</p><p className="flex items-center gap-1 text-xs text-stone-500"><Star className="size-3.5 fill-amber-400 text-amber-400" />{task.customer.ratingCount ? Number(task.customer.ratingAverage).toFixed(1) : "Новый профиль"}</p>{task.customer.telegramVerifiedAt && <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-sky-700 dark:text-sky-300"><BadgeCheck className="size-3.5" />Telegram Verified</p>}</div>
              </Link>
            </CardContent>
          </Card>

          <div className="flex items-start gap-3 rounded-3xl bg-blue-50 p-4 text-sm leading-6 text-blue-900"><ShieldCheck className="mt-0.5 size-5 shrink-0" /><span>Цена фиксируется при матчинге. Условия задачи сохраняются без изменений.</span></div>

          {match && (
            <Card className="border-emerald-200 bg-emerald-50"><CardContent>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Исполнитель</p>
              <Link href={`/users/${match.performer.id}`} className="mt-2 flex items-center gap-3 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"><UserAvatar name={match.performer.displayName} avatarUrl={match.performer.avatarUrl} /><span><span className="block font-bold">{match.performer.displayName}</span><span className="block text-xs text-stone-600">Рейтинг: {match.performer.ratingCount ? Number(match.performer.ratingAverage).toFixed(1) : "новый профиль"}</span></span></Link>
              <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">{match.performer.telegramVerifiedAt && <span className="flex items-center gap-1 text-sky-700"><BadgeCheck className="size-3.5" />Telegram Verified</span>}{isLocalPerformer && <span className="flex items-center gap-1 text-emerald-800"><Navigation className="size-3.5" />Локальный исполнитель</span>}</div>
              {isPerformer && <a href={`https://yandex.ru/maps/?rtext=~${Number(task.latitude)},${Number(task.longitude)}&rtt=pd`} target="_blank" rel="noreferrer noopener" className="mt-3 flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 text-sm font-bold text-white"><Navigation className="size-4" />Построить маршрут</a>}
              {isOwner && task.status === "COMPLETED" && <FavoritePerformerButton performerId={match.performer.id} initialFavorite={Boolean(favoritePerformer)} />}
            </CardContent></Card>
          )}

          {isPerformer && match?.status === "IN_PROGRESS" && <EtaControl taskId={task.id} initialEtaMinutes={match.bid?.etaMinutes ?? null} />}
          {isOwner && etaRemaining && task.status === "IN_PROGRESS" && match?.status === "IN_PROGRESS" && <div className="rounded-3xl border border-sky-200 bg-sky-50 p-4 text-sm font-bold text-sky-900 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200"><Clock3 className="mr-2 inline size-4" />Исполнитель будет примерно через {etaRemaining} мин.</div>}

          {match && isParticipant && <div id="chat" className="scroll-mt-4"><TaskChat taskId={task.id} canUploadProof={Boolean(isPerformer && match.status === "IN_PROGRESS")} /></div>}

          <Card><CardContent><p className="mb-3 text-xs font-bold uppercase tracking-wider text-stone-400">Ход задачи</p><ol className="space-y-2 text-sm">{timeline.map(([label, date]) => <li key={`${label}-${date.toISOString()}`} className="flex justify-between gap-3"><span>{label}</span><time className="shrink-0 text-stone-500">{date.toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</time></li>)}</ol>{awaitingConfirmation && <p className="mt-3 text-sm font-bold text-orange-700">Текущий статус: на подтверждении</p>}</CardContent></Card>

          {task.status === "COMPLETED" && <Card><CardContent><p className="mb-3 text-xs font-bold uppercase tracking-wider text-stone-400">Отзывы</p>{match?.reviews.length ? <div className="space-y-3">{match.reviews.map((review) => <div key={review.id} className="rounded-2xl bg-stone-50 p-3 text-sm"><p className="font-bold">{review.authorId === task.customerId ? "Заказчик" : "Исполнитель"} · {review.reaction === "GREAT" ? "😍 Отлично" : review.reaction === "OK" ? "🙂 Нормально" : "😕 Плохо"}</p>{review.tags.length > 0 && <p className="mt-2 flex flex-wrap gap-1">{review.tags.map((tag) => <span key={tag} className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-900">{{ FAST: "Быстро", POLITE: "Вежливо", ON_TIME: "Вовремя", QUALITY: "Качественно" }[tag]}</span>)}</p>}{review.comment && <p className="mt-2 text-stone-600">{review.comment}</p>}</div>)}</div> : <p className="text-sm text-stone-500">Отзывов пока нет.</p>}{isParticipant && !hasReviewed && <ReviewDialog taskId={task.id} initiallyOpen={query.review === "1"} allowTip={Boolean(isOwner)} />}</CardContent></Card>}

          {canManage && (
            <div className="space-y-2 rounded-3xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
              {isAdmin && !isOwner && <p className="text-xs font-bold text-emerald-700">Доступ администратора</p>}
              <Link href={`/tasks/${task.id}/edit`} className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-emerald-100 px-4 text-sm font-bold text-emerald-950 hover:bg-emerald-200"><Pencil className="size-4" /> Редактировать</Link>
              <DeleteTaskButton taskId={task.id} />
            </div>
          )}

          {isOwner && isRepeatableTaskStatus(task.status) && <Link href={`/?repeatTask=${task.id}`} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-4 text-sm font-black text-white"><Repeat2 className="size-4" /> Повторить задачу</Link>}
        </div>
      </div>

      <div className="above-bottom-nav fixed inset-x-0 z-30 border-t border-stone-200 bg-stone-50/95 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto max-w-md">
          {ownerCanConfirm ? (
            <div className="grid gap-2 sm:grid-cols-2"><TaskWorkflowButton taskId={task.id} action="confirm-completion" /><TaskWorkflowButton taskId={task.id} action="request-changes" secondary /></div>
          ) : performerCanComplete ? (
            <div className="space-y-2"><TaskWorkflowButton taskId={task.id} action="complete" disabledReason={hasPerformerProof ? undefined : "Сначала отправьте минимум одно фото выполненной работы в чат."} />{isPerformer && match?.status === "IN_PROGRESS" && <WithdrawTaskButton taskId={task.id} />}</div>
          ) : isOwner && ["ASSIGNED", "IN_PROGRESS"].includes(task.status) ? (
            <p className="rounded-2xl bg-blue-100 p-4 text-center text-sm font-bold text-blue-800">{awaitingConfirmation ? "Исполнитель завершил работу — подтвердите результат" : "Исполнитель работает над задачей"}</p>
          ) : isPerformer && awaitingConfirmation ? (
            <p className="rounded-2xl bg-orange-100 p-4 text-center text-sm font-bold text-orange-800">Работа отправлена заказчику — ждём подтверждения</p>
          ) : task.status === "COMPLETED" ? (
            <p className="rounded-2xl bg-emerald-100 p-4 text-center text-sm font-bold text-emerald-800">Задача выполнена и подтверждена</p>
          ) : isOwner ? (
            <p className="rounded-2xl bg-stone-200 p-4 text-center text-sm font-bold text-stone-700">Это ваша задача — ждём исполнителя</p>
          ) : availableForCurrentUser ? (
            <FastMatchButton taskId={task.id} authenticated={Boolean(currentUser)} cooldownUntil={currentUser?.cooldownUntil?.toISOString() ?? null} />
          ) : available && earlyAccessActive ? (
            <EarlyAccessNotice until={task.earlyAccessUntil!.toISOString()} />
          ) : (
            <p className="rounded-2xl bg-stone-200 p-4 text-center text-sm font-bold text-stone-700">Задача уже недоступна</p>
          )}
        </div>
      </div>
    </main>
  );
}
