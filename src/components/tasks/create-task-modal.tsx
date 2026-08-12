"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BookmarkPlus, Crosshair, House, LoaderCircle, MapPinned, Plus, Sparkles, Star } from "lucide-react";

import { LazyYandexMap } from "@/components/map/lazy-yandex-map";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { telegramNotification } from "@/lib/telegram/haptics";
import type { CategoryOption, Coordinates, TaskCreatePrefill } from "@/types/task";

const MOSCOW_CENTER: Coordinates = { latitude: 55.751244, longitude: 37.618423 };

const quickTemplates = [
  { title: "Выгул собаки", categorySlug: "pets", urgent: false, price: 500 },
  { title: "Срочный курьер", categorySlug: "delivery", urgent: true, price: 700 },
  { title: "Помощь с разгрузкой", categorySlug: "moving", urgent: false, price: 1500 },
  { title: "Подмена на смене", categorySlug: "shift", urgent: false, price: 2500 },
] as const;

type FavoritePlace = { id: string; name: string; addressLabel: string | null; latitude: number; longitude: number };

const pricePresetsByCategory: Record<string, readonly number[]> = {
  pets: [300, 500, 800],
  delivery: [400, 700, 1200],
  moving: [800, 1500, 2500],
  shift: [1500, 2500, 4000],
  "home-repair": [1000, 2000, 3500],
  cleaning: [1000, 1800, 3000],
  "tech-help": [800, 1500, 2500],
  other: [500, 1000, 2000],
};

export function CreateTaskModal({
  categories,
  apiKey,
  initialCoordinates,
  isAuthenticated,
  initialValues,
  initiallyOpen = false,
}: {
  categories: CategoryOption[];
  apiKey: string;
  initialCoordinates?: Coordinates | null;
  isAuthenticated: boolean;
  initialValues?: TaskCreatePrefill | null;
  initiallyOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(initiallyOpen);
  const [point, setPoint] = useState<Coordinates>(initialValues ? { latitude: initialValues.latitude, longitude: initialValues.longitude } : initialCoordinates ?? MOSCOW_CENTER);
  const [address, setAddress] = useState(initialValues?.addressLabel ?? "");
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const defaultCategoryId = categories.find((category) => category.slug === "other")?.id ?? "";
  const [categoryId, setCategoryId] = useState(initialValues?.categoryId ?? defaultCategoryId);
  const [title, setTitle] = useState(initialValues?.title ?? "");
  const [description, setDescription] = useState(initialValues?.description ?? "");
  const [priceRubles, setPriceRubles] = useState(initialValues?.priceRubles ?? "");
  const [isUrgent, setIsUrgent] = useState(initialValues?.isUrgent ?? false);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "TRANSFER">(initialValues?.paymentMethod ?? "CASH");
  const [offerPreviousPerformer, setOfferPreviousPerformer] = useState(Boolean(initialValues?.previousPerformer));
  const [places, setPlaces] = useState<FavoritePlace[]>([]);
  const [placeName, setPlaceName] = useState("");
  const [savingPlace, setSavingPlace] = useState(false);
  const selectedCategory = categories.find((category) => category.id === categoryId);
  const pricePresets = pricePresetsByCategory[selectedCategory?.slug ?? "other"] ?? pricePresetsByCategory.other;

  useEffect(() => {
    if (!initiallyOpen || !isAuthenticated) return;
    void fetch("/api/me/places", { cache: "no-store" })
      .then((response) => response.json())
      .then((result: { places?: FavoritePlace[] }) => setPlaces(result.places ?? []))
      .catch(() => undefined);
  }, [initiallyOpen, isAuthenticated]);

  const reverseGeocode = useCallback(async (coordinates: Coordinates) => {
    try {
      const params = new URLSearchParams({
        latitude: String(coordinates.latitude),
        longitude: String(coordinates.longitude),
      });
      const response = await fetch(`/api/geo/reverse?${params}`);
      const result = (await response.json()) as { address?: string | null };
      setAddress(result.address ?? "");
    } catch {
      setAddress("");
    }
  }, []);

  const selectPoint = useCallback(
    (coordinates: Coordinates) => {
      setPoint(coordinates);
      void reverseGeocode(coordinates);
    },
    [reverseGeocode],
  );

  const locate = useCallback(() => {
    setLocating(true);
    setError("");

    const applyLocation = (coordinates: Coordinates) => {
      setPoint(coordinates);
      setLocating(false);
      void reverseGeocode(coordinates);
    };

    const requestBrowserLocation = () => {
      if (!navigator.geolocation) {
        setLocating(false);
        setError("Геолокация недоступна. Выберите точку на карте.");
        return;
      }
      navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        applyLocation({ latitude: coords.latitude, longitude: coords.longitude });
      },
      () => {
        setLocating(false);
        setError("Не удалось определить позицию. Выберите точку на карте.");
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
      );
    };

    const webApp = window.Telegram?.WebApp;
    const locationManager = webApp?.initData && webApp.isVersionAtLeast("8.0")
      ? webApp.LocationManager
      : undefined;
    if (!locationManager) {
      requestBrowserLocation();
      return;
    }

    const requestTelegramLocation = () => {
      if (!locationManager.isLocationAvailable) {
        requestBrowserLocation();
        return;
      }
      locationManager.getLocation((location) => {
        if (location) {
          applyLocation({ latitude: location.latitude, longitude: location.longitude });
          return;
        }
        if (locationManager.isAccessRequested && !locationManager.isAccessGranted) {
          locationManager.openSettings();
          setLocating(false);
          setError("Разрешите геопозицию в настройках Telegram и нажмите «Моё место» ещё раз.");
          return;
        }
        requestBrowserLocation();
      });
    };

    if (locationManager.isInited) requestTelegramLocation();
    else locationManager.init(requestTelegramLocation);
  }, [reverseGeocode]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen && isAuthenticated) {
      void fetch("/api/me/places", { cache: "no-store" })
        .then((response) => response.json())
        .then((result: { places?: FavoritePlace[] }) => setPlaces(result.places ?? []))
        .catch(() => undefined);
    }
    if (nextOpen && initialCoordinates && !initialValues) {
      setPoint(initialCoordinates);
      void reverseGeocode(initialCoordinates);
    }
  }

  function applyTemplate(template: (typeof quickTemplates)[number]) {
    const category = categories.find((item) => item.slug === template.categorySlug);
    setTitle(template.title);
    if (category) setCategoryId(category.id);
    setIsUrgent(template.urgent);
    setPriceRubles(String(template.price));
  }

  function choosePlace(place: FavoritePlace) {
    setPoint({ latitude: place.latitude, longitude: place.longitude });
    setAddress(place.addressLabel ?? "");
  }

  async function savePlace() {
    if (!isAuthenticated) {
      router.push("/login?next=/");
      return;
    }
    if (!placeName.trim()) {
      setError("Назовите место, например «Дом».");
      return;
    }
    setSavingPlace(true);
    setError("");
    try {
      const response = await fetch("/api/me/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: placeName, addressLabel: address || null, latitude: point.latitude, longitude: point.longitude }),
      });
      const result = await response.json() as { place?: FavoritePlace; error?: string };
      if (!response.ok || !result.place) throw new Error(result.error ?? "Не удалось сохранить место.");
      setPlaces((current) => [result.place!, ...current.filter((place) => place.id !== result.place!.id && place.name !== result.place!.name)]);
      setPlaceName("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить место.");
    } finally {
      setSavingPlace(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAuthenticated) {
      router.push("/login?next=/");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId,
          title,
          description,
          priceRubles,
          latitude: point.latitude,
          longitude: point.longitude,
          addressLabel: address || null,
          startsAt: null,
          isUrgent,
          paymentMethod,
          repeatOfTaskId: initialValues?.repeatOfTaskId ?? null,
          offerPreviousPerformer,
        }),
      });
      const result = (await response.json()) as { taskId?: string; error?: string };
      if (!response.ok || !result.taskId) throw new Error(result.error ?? "Не удалось создать задачу.");
      telegramNotification("success");
      router.push(`/tasks/${result.taskId}`);
      router.refresh();
    } catch (cause) {
      setSubmitting(false);
      setError(cause instanceof Error ? cause.message : "Не удалось создать задачу.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="lg" className="rounded-full shadow-lg shadow-emerald-950/20">
          <Plus className="size-5" /> Создать задачу
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Что нужно сделать?</DialogTitle>
        <DialogDescription>Коротко опишите дело — публикация займёт меньше минуты.</DialogDescription>

        <form className="mt-6 space-y-5" onSubmit={submit}>
          {initialValues?.previousPerformer && (
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/40">
              <input
                type="checkbox"
                checked={offerPreviousPerformer}
                onChange={(event) => setOfferPreviousPerformer(event.target.checked)}
                className="mt-1 size-4 accent-emerald-700"
              />
              <span>
                <span className="block text-sm font-black text-emerald-950 dark:text-emerald-100">Сначала предложить {initialValues.previousPerformer.displayName}</span>
                <span className="mt-1 block text-xs leading-5 text-emerald-800 dark:text-emerald-300">Исполнитель получит уведомление первым. Через 4 минуты задача автоматически откроется всем рядом.</span>
              </span>
            </label>
          )}
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
            {quickTemplates.map((template) => (
              <button
                key={template.title}
                type="button"
                onClick={() => applyTemplate(template)}
                className="shrink-0 rounded-full border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:border-emerald-300 hover:bg-emerald-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-emerald-950"
              >
                {template.title}
              </button>
            ))}
          </div>
          <label className="block space-y-2">
            <span className="text-sm font-semibold">Категория</span>
            <select
              name="categoryId"
              required
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className="h-12 w-full rounded-2xl border border-stone-200 bg-white px-4 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100 dark:border-stone-700 dark:bg-stone-900 dark:focus:ring-emerald-950"
            >
              <option value="" disabled>Выберите категорию</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.icon} {category.name}</option>
              ))}
            </select>
          </label>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Оплата</legend>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex min-h-12 cursor-pointer items-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 text-sm font-semibold has-[:checked]:border-emerald-600 has-[:checked]:bg-emerald-50 dark:border-stone-700 dark:bg-stone-900 dark:has-[:checked]:bg-emerald-950">
                <input type="radio" name="paymentMethod" value="CASH" checked={paymentMethod === "CASH"} onChange={() => setPaymentMethod("CASH")} className="accent-emerald-700" /> Наличные
              </label>
              <label className="flex min-h-12 cursor-pointer items-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 text-sm font-semibold has-[:checked]:border-emerald-600 has-[:checked]:bg-emerald-50 dark:border-stone-700 dark:bg-stone-900 dark:has-[:checked]:bg-emerald-950">
                <input type="radio" name="paymentMethod" value="TRANSFER" checked={paymentMethod === "TRANSFER"} onChange={() => setPaymentMethod("TRANSFER")} className="accent-emerald-700" /> Перевод
              </label>
            </div>
          </fieldset>

          <label className="flex min-h-14 cursor-pointer items-start gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm has-[:checked]:border-orange-600 has-[:checked]:bg-orange-100 dark:border-orange-900 dark:bg-orange-950/40">
            <input type="checkbox" checked={isUrgent} onChange={(event) => setIsUrgent(event.target.checked)} className="mt-0.5 size-4 accent-orange-600" />
            <span><b className="block">Срочная задача ⚡</b><span className="text-xs text-orange-800 dark:text-orange-300">Нужно выполнить в течение 30–60 минут</span></span>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold">Задача</span>
            <Input name="title" value={title} onChange={(event) => setTitle(event.target.value)} required minLength={3} maxLength={120} placeholder="Например, помочь разгрузить машину" />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold">Подробности</span>
            <Textarea name="description" value={description} onChange={(event) => setDescription(event.target.value)} required minLength={10} maxLength={2000} placeholder="Что именно нужно сделать и сколько времени это займёт?" />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold">Стоимость</span>
            <div className="relative">
              <Input name="priceRubles" value={priceRubles} onChange={(event) => setPriceRubles(event.target.value)} required inputMode="decimal" pattern="[0-9]+([,.][0-9]{1,2})?" placeholder="800" className="pr-12 text-lg font-bold" />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-stone-500">₽</span>
            </div>
            <p className="text-xs text-stone-500">Исполнитель увидит сумму в рублях. В расчётах она хранится в копейках.</p>
            <div className="flex flex-wrap gap-2" aria-label="Быстрый выбор суммы">
              {pricePresets.map((preset) => (
                <button key={preset} type="button" onClick={() => setPriceRubles(String(preset))} className={`rounded-full border px-3 py-1.5 text-sm font-bold transition ${priceRubles === String(preset) ? "border-emerald-600 bg-emerald-50 text-emerald-900 dark:bg-emerald-950" : "border-stone-200 bg-white text-stone-700 hover:border-emerald-300 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"}`}>
                  {preset} ₽
                </button>
              ))}
            </div>
          </label>

          <div className="space-y-3">
            <span className="text-sm font-semibold">Где выполнить</span>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" aria-label="Быстрый выбор места">
              <button type="button" onClick={locate} disabled={locating} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 text-sm font-bold text-blue-900 disabled:opacity-50 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200">
                {locating ? <LoaderCircle className="size-4 animate-spin" /> : <Crosshair className="size-4" />} Текущее место
              </button>
              {places.map((place) => {
                const isHome = place.name.trim().toLocaleLowerCase("ru-RU") === "дом";
                const PlaceIcon = isHome ? House : Star;
                return <button key={place.id} type="button" onClick={() => choosePlace(place)} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 text-sm font-bold text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200"><PlaceIcon className="size-4" />{place.name}</button>;
              })}
            </div>
            <LazyYandexMap
              apiKey={apiKey}
              center={point}
              selectedPoint={point}
              selectable
              onPointSelect={selectPoint}
              className="h-56"
            />
            <div className="flex items-start gap-2 rounded-2xl bg-white p-3 text-sm text-stone-600 dark:bg-stone-900 dark:text-stone-300">
              <MapPinned className="mt-0.5 size-4 shrink-0 text-emerald-700" />
              <span>{address || `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`}</span>
            </div>
            {isAuthenticated && <div className="flex gap-2"><Input value={placeName} onChange={(event) => setPlaceName(event.target.value)} maxLength={40} placeholder="Дом, Работа, Мой бизнес" aria-label="Название сохранённого места" /><Button type="button" variant="outline" onClick={() => void savePlace()} disabled={savingPlace || !placeName.trim()}>{savingPlace ? <LoaderCircle className="size-4 animate-spin" /> : <BookmarkPlus className="size-4" />}Сохранить</Button></div>}
          </div>

          {error && <p role="alert" className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

          <Button type="submit" size="lg" className="w-full" disabled={submitting || categories.length === 0}>
            {submitting ? <LoaderCircle className="size-5 animate-spin" /> : <Sparkles className="size-5" />}
            {submitting ? "Публикуем…" : "Опубликовать сейчас"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
