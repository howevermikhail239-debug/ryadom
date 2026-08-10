"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { telegramNotification, telegramSelectionChanged } from "@/lib/telegram/haptics";

const reactions = [
  { id: "GREAT", emoji: "😍", label: "Отлично" },
  { id: "OK", emoji: "🙂", label: "Нормально" },
  { id: "BAD", emoji: "😕", label: "Плохо" },
] as const;
const tagOptions = [
  { id: "FAST", label: "Быстро" },
  { id: "POLITE", label: "Вежливо" },
  { id: "ON_TIME", label: "Вовремя" },
  { id: "QUALITY", label: "Качественно" },
] as const;

export function ReviewForm({ taskId, allowTip = false }: { taskId: string; allowTip?: boolean }) {
  const router = useRouter();
  const [reaction, setReaction] = useState<(typeof reactions)[number]["id"]>("GREAT");
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [tipRubles, setTipRubles] = useState("0");
  const [success, setSuccess] = useState("");

  function toggleTag(tag: string) {
    telegramSelectionChanged();
    setTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/tasks/${taskId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reaction, tags, comment: form.get("comment"), tipRubles: allowTip ? tipRubles : "0" }),
      });
      const result = await response.json() as { ok?: boolean; error?: string; tipKopecks?: number };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Не удалось сохранить отзыв.");
      telegramNotification("success");
      setSuccess((result.tipKopecks ?? 0) > 0 ? "Чаевые отправлены" : "Отзыв сохранён");
      window.setTimeout(() => router.refresh(), 1200);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить отзыв.");
      setSaving(false);
    }
  }

  return <form onSubmit={submit} className="space-y-4">
    <div className="grid grid-cols-3 gap-2" aria-label="Впечатление">{reactions.map((item) => <button key={item.id} type="button" onClick={() => { setReaction(item.id); telegramSelectionChanged(); }} className={`rounded-2xl border p-3 text-center transition ${reaction === item.id ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950" : "border-stone-200 dark:border-stone-700"}`}><span className="block text-2xl">{item.emoji}</span><span className="mt-1 block text-xs font-bold">{item.label}</span></button>)}</div>
    <div className="flex flex-wrap gap-2" aria-label="Короткие характеристики">{tagOptions.map((tag) => <button key={tag.id} type="button" onClick={() => toggleTag(tag.id)} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${tags.includes(tag.id) ? "border-emerald-600 bg-emerald-100 text-emerald-900" : "border-stone-200 bg-white text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300"}`}>{tag.label}</button>)}</div>
    {allowTip && <fieldset className="space-y-2"><legend className="text-sm font-bold">Оставить на чай</legend><div className="flex gap-2">{[50, 100, 200].map((amount) => <button key={amount} type="button" onClick={() => setTipRubles(String(amount))} className={`rounded-full border px-3 py-2 text-sm font-bold ${tipRubles === String(amount) ? "border-amber-500 bg-amber-100 text-amber-950" : "border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900"}`}>+{amount} ₽</button>)}</div><Input value={tipRubles === "0" ? "" : tipRubles} onChange={(event) => setTipRubles(event.target.value.replace(/[^0-9,.]/g, ""))} inputMode="decimal" placeholder="Своя сумма, ₽" aria-label="Своя сумма чаевых" /></fieldset>}
    <Textarea name="comment" maxLength={1000} placeholder="Комментарий — необязательно" />
    <Button type="submit" disabled={saving} className="w-full">{saving ? "Сохраняем…" : "Отправить отзыв"}</Button>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {success && <div role="status" className="fixed bottom-24 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-emerald-950 px-5 py-3 text-sm font-bold text-white shadow-xl">{success}</div>}
  </form>;
}
