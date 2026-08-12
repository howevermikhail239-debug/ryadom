"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RadioTower } from "lucide-react";

const choices = [{ minutes: 30, label: "30 мин" }, { minutes: 60, label: "1 час" }, { minutes: 120, label: "2 часа" }] as const;

export function AvailabilityControl({ initialUntil, initialActive }: { initialUntil: string | null; initialActive: boolean }) {
  const router = useRouter();
  const [until, setUntil] = useState(initialUntil);
  const [active, setActive] = useState(initialActive);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function change(minutes: 0 | 30 | 60 | 120) {
    setPending(true);
    setMessage(null);
    const response = await fetch("/api/me/availability", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ minutes }) });
    const result = await response.json() as { error?: string; availableUntil?: string | null; locationActive?: boolean };
    if (response.ok) {
      setUntil(result.availableUntil ?? null);
      setActive(minutes > 0);
      setMessage(minutes > 0 && !result.locationActive ? "Откройте карту и обновите геопозицию, чтобы получать задачи рядом." : null);
      window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.();
      router.refresh();
    } else setMessage(result.error ?? "Не удалось изменить доступность.");
    setPending(false);
  }

  return <section className="mt-4 rounded-3xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-950/30">
    <div className="flex items-start gap-3"><span className={`grid size-10 place-items-center rounded-2xl ${active ? "bg-emerald-600 text-white" : "bg-white text-stone-500 dark:bg-stone-900"}`}><RadioTower className="size-5" /></span><div><h2 className="font-black">Готов брать задачи рядом</h2><p className="mt-0.5 text-sm text-stone-600 dark:text-stone-300">Доступные исполнители получают приоритет в уведомлениях.</p></div></div>
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{choices.map((choice) => <button key={choice.minutes} type="button" disabled={pending} onClick={() => change(choice.minutes)} className="min-h-11 rounded-full border border-emerald-300 bg-white px-3 text-sm font-bold text-emerald-900 disabled:opacity-50 dark:border-emerald-800 dark:bg-stone-900 dark:text-emerald-200">{choice.label}</button>)}<button type="button" disabled={pending || !active} onClick={() => change(0)} className="min-h-11 rounded-full border border-stone-300 px-3 text-sm font-bold disabled:opacity-50 dark:border-stone-700">Выключить</button></div>
    {active && until && <p className="mt-3 text-xs font-bold text-emerald-800 dark:text-emerald-300">Активно до {new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(until))}</p>}
    {message && <p className="mt-3 text-xs font-semibold text-amber-700 dark:text-amber-300">{message}</p>}
  </section>;
}
