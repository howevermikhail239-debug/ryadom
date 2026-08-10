"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, LoaderCircle, MapPinned, Save } from "lucide-react";
import Link from "next/link";

import { LazyYandexMap } from "@/components/map/lazy-yandex-map";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CategoryOption, Coordinates } from "@/types/task";

type EditableTask = {
  id: string;
  categoryId: string;
  title: string;
  description: string;
  priceRubles: string;
  latitude: number;
  longitude: number;
  addressLabel: string | null;
  startsAt: string | null;
  isUrgent: boolean;
  paymentMethod: "CASH" | "TRANSFER";
};

export function EditTaskForm({ task, categories, apiKey }: { task: EditableTask; categories: CategoryOption[]; apiKey: string }) {
  const router = useRouter();
  const [point, setPoint] = useState<Coordinates>({ latitude: task.latitude, longitude: task.longitude });
  const [address, setAddress] = useState(task.addressLabel ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const selectPoint = useCallback(async (coordinates: Coordinates) => {
    setPoint(coordinates);
    try {
      const params = new URLSearchParams({ latitude: String(coordinates.latitude), longitude: String(coordinates.longitude) });
      const response = await fetch(`/api/geo/reverse?${params}`);
      const result = (await response.json()) as { address?: string | null };
      setAddress(result.address ?? "");
    } catch {
      setAddress("");
    }
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const startsAtValue = String(form.get("startsAt") ?? "");
    const response = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryId: form.get("categoryId"),
        title: form.get("title"),
        description: form.get("description"),
        priceRubles: form.get("priceRubles"),
        latitude: point.latitude,
        longitude: point.longitude,
        addressLabel: address || null,
        startsAt: startsAtValue ? new Date(startsAtValue).toISOString() : null,
        isUrgent: form.get("urgency") === "URGENT",
        paymentMethod: form.get("paymentMethod"),
      }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setSubmitting(false);
      setError(result.error ?? "Не удалось сохранить изменения.");
      return;
    }
    router.replace(`/tasks/${task.id}`);
    router.refresh();
  }

  const startsAtLocal = task.startsAt ? task.startsAt.slice(0, 16) : "";

  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-4 py-5 sm:px-8">
      <Link href={`/tasks/${task.id}`} className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold shadow-sm dark:bg-stone-900"><ArrowLeft className="size-4" /> Назад к задаче</Link>
      <h1 className="text-3xl font-black tracking-tight">Редактирование задачи</h1>
      <p className="mt-1 text-sm text-stone-500">Изменения сразу появятся на карте и в общем списке.</p>

      <form className="mt-7 space-y-5" onSubmit={submit}>
        <label className="block space-y-2"><span className="text-sm font-semibold">Категория</span>
          <select name="categoryId" defaultValue={task.categoryId} required className="h-12 w-full rounded-2xl border border-stone-200 bg-white px-4 dark:border-stone-700 dark:bg-stone-900">
            {categories.map((category) => <option key={category.id} value={category.id}>{category.icon} {category.name}</option>)}
          </select>
        </label>
        <label className="block space-y-2"><span className="text-sm font-semibold">Задача</span><Input name="title" defaultValue={task.title} minLength={3} maxLength={120} required /></label>
        <label className="block space-y-2"><span className="text-sm font-semibold">Подробности</span><Textarea name="description" defaultValue={task.description} minLength={10} maxLength={2000} required /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-2"><span className="text-sm font-semibold">Стоимость, ₽</span><Input name="priceRubles" defaultValue={task.priceRubles} inputMode="decimal" required /></label>
          <label className="block space-y-2"><span className="text-sm font-semibold">Начало (необязательно)</span><Input name="startsAt" type="datetime-local" defaultValue={startsAtLocal} /></label>
        </div>
        <fieldset className="space-y-2"><legend className="text-sm font-semibold">Оплата</legend><div className="grid grid-cols-2 gap-2">
          <label className="rounded-2xl border border-stone-200 p-4 dark:border-stone-700"><input className="mr-2 accent-emerald-700" type="radio" name="paymentMethod" value="CASH" defaultChecked={task.paymentMethod === "CASH"} />Наличные</label>
          <label className="rounded-2xl border border-stone-200 p-4 dark:border-stone-700"><input className="mr-2 accent-emerald-700" type="radio" name="paymentMethod" value="TRANSFER" defaultChecked={task.paymentMethod === "TRANSFER"} />Перевод</label>
        </div></fieldset>
        <fieldset className="space-y-2"><legend className="text-sm font-semibold">Срочность</legend><div className="grid grid-cols-2 gap-2"><label className="rounded-2xl border border-stone-200 p-4 dark:border-stone-700"><input className="mr-2 accent-emerald-700" type="radio" name="urgency" value="NORMAL" defaultChecked={!task.isUrgent} />Обычная</label><label className="rounded-2xl border border-orange-200 bg-orange-50 p-4 dark:border-orange-900 dark:bg-orange-950/40"><input className="mr-2 accent-orange-600" type="radio" name="urgency" value="URGENT" defaultChecked={task.isUrgent} />Срочная</label></div></fieldset>
        <div className="space-y-3"><span className="text-sm font-semibold">Точка на карте</span><LazyYandexMap apiKey={apiKey} center={point} selectedPoint={point} selectable onPointSelect={selectPoint} className="h-72" />
          <p className="flex items-start gap-2 rounded-2xl bg-white p-3 text-sm text-stone-600 dark:bg-stone-900 dark:text-stone-300"><MapPinned className="mt-0.5 size-4 shrink-0 text-emerald-700" />{address || `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`}</p>
        </div>
        {error && <p role="alert" className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={submitting}>{submitting ? <LoaderCircle className="size-5 animate-spin" /> : <Save className="size-5" />} {submitting ? "Сохраняем…" : "Сохранить изменения"}</Button>
      </form>
    </main>
  );
}
