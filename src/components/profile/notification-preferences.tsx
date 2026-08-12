"use client";

import { useState } from "react";
import { BellRing, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CategoryOption } from "@/types/task";

const RADII = [500, 1000, 3000, 5000] as const;

function minutesToTime(value: number | null) {
  if (value === null) return "";
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function timeToMinutes(value: string) {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function NotificationPreferences({
  categories,
  initial,
}: {
  categories: CategoryOption[];
  initial: { nearbyEnabled: boolean; radiusMeters: number; categoryIds: string[]; quietHoursStart: number | null; quietHoursEnd: number | null };
}) {
  const [nearbyEnabled, setNearbyEnabled] = useState(initial.nearbyEnabled);
  const [radiusMeters, setRadiusMeters] = useState(initial.radiusMeters);
  const [categoryIds, setCategoryIds] = useState(initial.categoryIds);
  const [quietEnabled, setQuietEnabled] = useState(initial.quietHoursStart !== null);
  const [quietStart, setQuietStart] = useState(minutesToTime(initial.quietHoursStart) || "23:00");
  const [quietEnd, setQuietEnd] = useState(minutesToTime(initial.quietHoursEnd) || "08:00");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function toggleCategory(id: string) {
    setCategoryIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/me/notification-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nearbyEnabled,
          radiusMeters,
          categoryIds,
          quietHoursStart: quietEnabled ? timeToMinutes(quietStart) : null,
          quietHoursEnd: quietEnabled ? timeToMinutes(quietEnd) : null,
        }),
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Не удалось сохранить.");
      setMessage("Настройки сохранены");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="mt-4 rounded-3xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
    <div className="flex items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 font-black"><BellRing className="size-5 text-emerald-700" /> Задачи рядом</h2><p className="mt-1 text-xs text-stone-500">Управляет Telegram-уведомлениями, но не скрывает задачи из карты.</p></div><input type="checkbox" checked={nearbyEnabled} onChange={(event) => setNearbyEnabled(event.target.checked)} className="size-5 accent-emerald-700" aria-label="Уведомления о задачах рядом" /></div>
    <div className={`mt-4 space-y-4 ${nearbyEnabled ? "" : "pointer-events-none opacity-50"}`}>
      <div><p className="mb-2 text-sm font-bold">Радиус</p><div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">{RADII.map((radius) => <button key={radius} type="button" onClick={() => setRadiusMeters(radius)} className={`shrink-0 rounded-full px-3 py-2 text-sm font-bold ${radiusMeters === radius ? "bg-emerald-950 text-white" : "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200"}`}>{radius < 1000 ? `${radius} м` : `${radius / 1000} км`}</button>)}</div></div>
      <div><p className="mb-1 text-sm font-bold">Категории</p><p className="mb-2 text-xs text-stone-500">Ничего не выбрано — присылать все.</p><div className="flex flex-wrap gap-2">{categories.map((category) => <button key={category.id} type="button" onClick={() => toggleCategory(category.id)} className={`rounded-full px-3 py-2 text-xs font-bold ${categoryIds.includes(category.id) ? "bg-emerald-100 text-emerald-950 ring-1 ring-emerald-400" : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300"}`}>{category.icon} {category.name}</button>)}</div></div>
      <div><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={quietEnabled} onChange={(event) => setQuietEnabled(event.target.checked)} className="size-4 accent-emerald-700" /> Тихие часы</label>{quietEnabled && <div className="mt-2 flex items-center gap-2"><input type="time" value={quietStart} onChange={(event) => setQuietStart(event.target.value)} className="min-h-11 rounded-xl border border-stone-200 bg-white px-3 dark:border-stone-700 dark:bg-stone-950" aria-label="Начало тихих часов" /><span>—</span><input type="time" value={quietEnd} onChange={(event) => setQuietEnd(event.target.value)} className="min-h-11 rounded-xl border border-stone-200 bg-white px-3 dark:border-stone-700 dark:bg-stone-950" aria-label="Конец тихих часов" /></div>}</div>
    </div>
    <div className="mt-4 flex items-center gap-3"><Button type="button" onClick={() => void save()} disabled={saving}>{saving && <LoaderCircle className="size-4 animate-spin" />}Сохранить</Button>{message && <p className="text-xs font-semibold text-stone-500" role="status">{message}</p>}</div>
  </section>;
}
