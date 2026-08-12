"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock3 } from "lucide-react";

import { ETA_PRESETS } from "@/lib/tasks/eta";

export function EtaControl({ taskId, initialEtaMinutes }: { taskId: string; initialEtaMinutes: number | null }) {
  const router = useRouter();
  const [custom, setCustom] = useState(initialEtaMinutes?.toString() ?? "");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(etaMinutes: number) {
    setPending(true);
    setMessage(null);
    const response = await fetch(`/api/tasks/${taskId}/eta`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ etaMinutes }) });
    const result = await response.json() as { error?: string };
    setMessage(response.ok ? `Заказчик увидит: примерно через ${etaMinutes} мин.` : result.error ?? "Не удалось сохранить ETA.");
    if (response.ok) {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("success");
      router.refresh();
    }
    setPending(false);
  }

  return <section className="rounded-3xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-900 dark:bg-sky-950/30">
    <h2 className="flex items-center gap-2 font-black"><Clock3 className="size-5 text-sky-700 dark:text-sky-300" /> Когда вы будете на месте?</h2>
    <div className="mt-3 flex gap-2 overflow-x-auto">{ETA_PRESETS.map((minutes) => <button key={minutes} type="button" disabled={pending} onClick={() => { setCustom(String(minutes)); void save(minutes); }} className="min-h-11 shrink-0 rounded-full border border-sky-300 bg-white px-4 text-sm font-bold text-sky-900 disabled:opacity-50 dark:border-sky-800 dark:bg-stone-900 dark:text-sky-200">{minutes} мин</button>)}</div>
    <div className="mt-3 flex gap-2"><input value={custom} onChange={(event) => setCustom(event.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" placeholder="Своё время" className="min-h-11 min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3 text-sm dark:border-stone-700 dark:bg-stone-900" /><button type="button" disabled={pending || Number(custom) < 5 || Number(custom) > 180} onClick={() => save(Number(custom))} className="min-h-11 rounded-xl bg-sky-700 px-4 text-sm font-bold text-white disabled:opacity-40">Сохранить</button></div>
    {message && <p className="mt-2 text-xs font-semibold text-stone-600 dark:text-stone-300">{message}</p>}
  </section>;
}
