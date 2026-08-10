"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Crosshair, LoaderCircle, LocateFixed, MapPin, RefreshCw } from "lucide-react";

import { AccountMenu } from "@/components/auth/account-menu";
import { LazyYandexMap } from "@/components/map/lazy-yandex-map";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { CreateTaskModal } from "@/components/tasks/create-task-modal";
import { TaskCard } from "@/components/tasks/task-card";
import { Button } from "@/components/ui/button";
import { telegramSelectionChanged } from "@/lib/telegram/haptics";
import type { CategoryOption, Coordinates, ExecutorPoint, TaskFeedItem } from "@/types/task";

const MOSCOW_CENTER: Coordinates = { latitude: 55.751244, longitude: 37.618423 };
const RADII = [500, 1000, 3000] as const;
const FILTERS = [
  { id: "all", label: "Все" },
  { id: "urgent", label: "Срочные ⚡" },
  { id: "walking", label: "Пешком" },
  { id: "car", label: "На авто" },
  { id: "light", label: "Легкие" },
] as const;

export function FeedPage({
  apiKey,
  categories,
  user,
}: {
  apiKey: string;
  categories: CategoryOption[];
  user: { displayName: string; avatarUrl: string | null; isAdmin: boolean; telegramVerified: boolean } | null;
}) {
  const [userCenter, setUserCenter] = useState<Coordinates>(MOSCOW_CENTER);
  const [searchCenter, setSearchCenter] = useState<Coordinates>(MOSCOW_CENTER);
  const [radius, setRadius] = useState<(typeof RADII)[number]>(1000);
  const [tasks, setTasks] = useState<TaskFeedItem[]>([]);
  const [executors, setExecutors] = useState<ExecutorPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [geoMessage, setGeoMessage] = useState("Определяем ваше местоположение…");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const filteredTasks = useMemo(() => tasks.filter((task) => {
    if (filter === "urgent") return task.isUrgent;
    if (filter === "walking") return task.distanceMeters !== null && task.distanceMeters <= 1500 && !["moving", "shift"].includes(task.category.slug);
    if (filter === "car") return ["delivery", "moving"].includes(task.category.slug);
    if (filter === "light") return task.priceKopecks <= 100_000 && !["moving", "shift"].includes(task.category.slug);
    return true;
  }), [filter, tasks]);

  const loadTasks = useCallback(async (coordinates: Coordinates, selectedRadius: number) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        latitude: String(coordinates.latitude),
        longitude: String(coordinates.longitude),
        radius: String(selectedRadius),
      });
      const [response, executorResponse] = await Promise.all([
        fetch(`/api/tasks/nearby?${params}`, { cache: "no-store" }),
        fetch(`/api/executors/nearby?${params}`, { cache: "no-store" }),
      ]);
      const result = (await response.json()) as { tasks?: TaskFeedItem[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Не удалось загрузить задачи.");
      setTasks(result.tasks ?? []);
      if (executorResponse.ok) {
        const activity = await executorResponse.json() as { executors?: ExecutorPoint[] };
        setExecutors(activity.executors ?? []);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить задачи.");
    } finally {
      setLoading(false);
    }
  }, []);

  const saveLocation = useCallback(async (coordinates: Coordinates, accuracy: number) => {
    if (!user) return;
    await fetch("/api/me/location", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...coordinates, accuracyMeters: Math.round(accuracy) }),
    }).catch(() => undefined);
  }, [user]);

  const applyPosition = useCallback((position: Coordinates, accuracy: number) => {
    setUserCenter(position);
    setSearchCenter(position);
    setLocating(false);
    setGeoMessage("Показываем задачи рядом с вами");
    void saveLocation(position, accuracy);
  }, [saveLocation]);

  useEffect(() => { const timer = window.setTimeout(() => void loadTasks(searchCenter, radius), 300); return () => window.clearTimeout(timer); }, [searchCenter, radius, loadTasks]);
  const handleCameraChange = useCallback((nextCenter: Coordinates) => { setSearchCenter((current) => Math.abs(current.latitude - nextCenter.latitude) < 0.00001 && Math.abs(current.longitude - nextCenter.longitude) < 0.00001 ? current : nextCenter); }, []);

  const locate = useCallback((openTelegramSettingsOnDenied = false) => {
    setLocating(true);
    setGeoMessage("Определяем ваше местоположение…");

    const requestBrowserLocation = () => {
      if (!navigator.geolocation) {
        setLocating(false);
        setGeoMessage("Геолокация недоступна — показан центр Москвы");
        void loadTasks(MOSCOW_CENTER, radius);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          applyPosition({ latitude: coords.latitude, longitude: coords.longitude }, coords.accuracy);
        },
        (geoError) => {
          setLocating(false);
          const message = geoError.code === geoError.PERMISSION_DENIED
            ? "Доступ запрещён. Разрешите геопозицию у значка замка в адресной строке"
            : geoError.code === geoError.TIMEOUT
              ? "Не дождались координат. Проверьте геолокацию устройства и повторите"
              : "Устройство не смогло определить координаты — показан центр Москвы";
          setGeoMessage(message);
          void loadTasks(MOSCOW_CENTER, radius);
        },
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
      );
    };

    const telegramWebApp = window.Telegram?.WebApp;
    const locationManager =
      telegramWebApp?.initData && telegramWebApp.isVersionAtLeast("8.0")
        ? telegramWebApp.LocationManager
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
          applyPosition(
            { latitude: location.latitude, longitude: location.longitude },
            location.horizontal_accuracy ?? 0,
          );
          return;
        }

        if (openTelegramSettingsOnDenied && locationManager.isAccessRequested && !locationManager.isAccessGranted) {
          locationManager.openSettings();
          setLocating(false);
          setGeoMessage("Разрешите геопозицию в настройках Telegram и нажмите кнопку ещё раз");
          void loadTasks(MOSCOW_CENTER, radius);
          return;
        }
        requestBrowserLocation();
      });
    };

    if (locationManager.isInited) requestTelegramLocation();
    else locationManager.init(requestTelegramLocation);
  }, [applyPosition, loadTasks, radius]);

  useEffect(() => {
    const timer = window.setTimeout(() => locate(false), 300);
    return () => window.clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function changeRadius(nextRadius: (typeof RADII)[number]) {
    if (nextRadius === radius) return;
    telegramSelectionChanged();
    setRadius(nextRadius);
  }

  return (
    <main className="mx-auto min-h-dvh max-w-5xl pb-44">
      <header className="flex items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" className="flex items-center gap-3" aria-label="Рядом — главная">
          <span className="grid size-11 place-items-center rounded-2xl bg-emerald-950 text-white shadow-md"><MapPin className="size-5" /></span>
          <span><b className="block text-lg font-black tracking-tight">Рядом</b><small className="block text-[11px] text-stone-500">помощь за углом</small></span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {user ? <AccountMenu user={user} /> : <Link href="/login" className="rounded-full bg-white px-4 py-2.5 text-sm font-bold shadow-sm dark:bg-stone-900">Войти</Link>}
        </div>
      </header>

      <section className="px-4 sm:px-8">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-emerald-800"><LocateFixed className="size-3.5" />{geoMessage}</p>
            <h1 className="text-3xl font-black tracking-[-0.04em] sm:text-4xl">Что происходит рядом</h1>
          </div>
          <Button type="button" size="icon" variant="outline" onClick={() => locate(true)} disabled={locating} aria-label="Обновить местоположение">
            {locating ? <LoaderCircle className="size-5 animate-spin" /> : <Crosshair className="size-5" />}
          </Button>
        </div>

        <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" aria-label="Фильтры задач">
          {FILTERS.map((item) => <button key={item.id} type="button" onClick={() => { if (filter !== item.id) { setFilter(item.id); telegramSelectionChanged(); } }} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${filter === item.id ? "bg-emerald-950 text-white" : "border border-stone-200 bg-white text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"}`}>{item.label}</button>)}
        </div>
        <div className="relative">
          <LazyYandexMap apiKey={apiKey} center={userCenter} tasks={filteredTasks} executors={executors} onCameraChange={handleCameraChange} searchRadiusMeters={radius} className="h-[360px] sm:h-[430px]" />
          <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1 rounded-full bg-white/95 p-1.5 shadow-xl backdrop-blur">
            {RADII.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => changeRadius(value)}
                className={`min-h-10 rounded-full px-4 text-sm font-bold transition ${radius === value ? "bg-emerald-950 text-white" : "text-stone-600 hover:bg-stone-100"}`}
              >
                {value < 1000 ? `${value} м` : `${value / 1000} км`}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pt-8 sm:px-8">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black">Задачи поблизости</h2>
            <p className="text-sm text-stone-500">{loading ? "Ищем…" : `${filteredTasks.length} ${filteredTasks.length === 1 ? "задача" : "задач"} по фильтру`}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void loadTasks(searchCenter, radius)} disabled={loading}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Обновить
          </Button>
        </div>

        {error && <p role="alert" className="mb-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
        {loading && tasks.length === 0 ? (
          <div className="grid min-h-44 place-items-center text-sm text-stone-500"><span className="flex items-center gap-2"><LoaderCircle className="size-5 animate-spin" /> Собираем задачи рядом</span></div>
        ) : filteredTasks.length ? (
          <div className="grid gap-3 md:grid-cols-2">{filteredTasks.map((task) => <TaskCard key={task.id} task={task} />)}</div>
        ) : (
          <div className="rounded-3xl border border-dashed border-stone-300 bg-white/50 p-10 text-center">
            <MapPin className="mx-auto mb-3 size-8 text-stone-400" />
            <h3 className="font-bold">Пока тихо</h3>
            <p className="mt-1 text-sm text-stone-500">Расширьте радиус или создайте первую задачу рядом.</p>
          </div>
        )}
      </section>

      <div className="above-bottom-nav fixed inset-x-0 z-30 px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-center gap-2">
          <CreateTaskModal categories={categories} apiKey={apiKey} initialCoordinates={userCenter} isAuthenticated={Boolean(user)} />
        </div>
      </div>
    </main>
  );
}
