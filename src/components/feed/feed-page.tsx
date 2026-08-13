"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Crosshair, Eye, EyeOff, Layers3, LoaderCircle, LocateFixed, MapPin, RefreshCw, Search } from "lucide-react";

import { AccountMenu } from "@/components/auth/account-menu";
import { LazyYandexMap } from "@/components/map/lazy-yandex-map";
import { TaskMapPreview } from "@/components/map/task-map-preview";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { CreateTaskModal } from "@/components/tasks/create-task-modal";
import { TaskCard } from "@/components/tasks/task-card";
import { Button } from "@/components/ui/button";
import { trackMapEvent } from "@/lib/analytics/map-client";
import {
  BoundedDiscoveryCache,
  EXECUTOR_CACHE_TTL_MS,
  LatestRequestGuard,
  TASK_CACHE_TTL_MS,
  buildDiscoveryCacheKey,
  commitMapAreaSearch,
  commitNearMeSearch,
  parsePersistedMapState,
  shouldOfferSearchHere,
  type MapCameraSnapshot,
  type PersistedMapState,
  type SearchState,
} from "@/lib/map/discovery";
import { telegramSelectionChanged } from "@/lib/telegram/haptics";
import type { CategoryOption, Coordinates, ExecutorPoint, TaskCreatePrefill, TaskFeedItem } from "@/types/task";

const MOSCOW_CENTER: Coordinates = { latitude: 55.751244, longitude: 37.618423 };
const RADII = [500, 1000, 3000] as const;
const STORAGE_KEY = "ryadom-map-state-v1";
const FILTERS = [
  { id: "all", label: "Все" },
  { id: "urgent", label: "Срочные ⚡" },
  { id: "walking", label: "Пешком" },
  { id: "car", label: "На авто" },
  { id: "light", label: "Легкие" },
  { id: "verified", label: "Проверенные ✓" },
] as const;
type FilterId = (typeof FILTERS)[number]["id"];

function radiusLabel(radius: number) {
  return radius < 1000 ? `${radius} м` : `${radius / 1000} км`;
}

export function FeedPage({
  apiKey,
  categories,
  user,
  repeatPrefill,
}: {
  apiKey: string;
  categories: CategoryOption[];
  user: { displayName: string; avatarUrl: string | null; isAdmin: boolean; telegramVerified: boolean } | null;
  repeatPrefill?: TaskCreatePrefill | null;
}) {
  const [hydrated, setHydrated] = useState(false);
  const [userCenter, setUserCenter] = useState<Coordinates>(MOSCOW_CENTER);
  const [hasUserLocation, setHasUserLocation] = useState(false);
  const [search, setSearch] = useState<SearchState>({ anchor: MOSCOW_CENTER, radius: 1000, mode: "near_me" });
  const [camera, setCamera] = useState<MapCameraSnapshot>({ center: MOSCOW_CENTER, zoom: 14 });
  const [tasks, setTasks] = useState<TaskFeedItem[]>([]);
  const [executors, setExecutors] = useState<ExecutorPoint[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);
  const [executorRefreshing, setExecutorRefreshing] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoMessage, setGeoMessage] = useState("Определяем ваше местоположение…");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const [showTasks, setShowTasks] = useState(true);
  const [showExecutors, setShowExecutors] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [executorHint, setExecutorHint] = useState(false);
  const [fitRadiusKey, setFitRadiusKey] = useState(0);
  const [showAllKey, setShowAllKey] = useState(0);
  const [focusTaskKey, setFocusTaskKey] = useState(0);
  const taskCacheRef = useRef(new BoundedDiscoveryCache<TaskFeedItem[]>());
  const executorCacheRef = useRef(new BoundedDiscoveryCache<ExecutorPoint[]>());
  const taskGuardRef = useRef(new LatestRequestGuard());
  const executorGuardRef = useRef(new LatestRequestGuard());
  const taskAbortRef = useRef<AbortController | null>(null);
  const executorAbortRef = useRef<AbortController | null>(null);
  const searchRef = useRef(search);
  const hasTaskDataRef = useRef(false);
  const restoredRef = useRef(false);
  const scrollYRef = useRef(0);
  const pendingScrollRestoreRef = useRef<number | null>(null);
  const navigationPendingRef = useRef(false);
  const persistedStateRef = useRef<PersistedMapState>({
    search,
    camera,
    filter,
    showTasks,
    showExecutors,
    selectedTaskId,
    scrollY: 0,
  });
  const hintTimerRef = useRef<number | null>(null);
  useEffect(() => { searchRef.current = search; }, [search]);
  useEffect(() => { hasTaskDataRef.current = tasks.length > 0; }, [tasks.length]);

  const filteredTasks = useMemo(() => tasks.filter((task) => {
    if (filter === "urgent") return task.isUrgent;
    if (filter === "walking") return task.distanceMeters !== null && task.distanceMeters <= 1500 && !["moving", "shift"].includes(task.category.slug);
    if (filter === "car") return ["delivery", "moving"].includes(task.category.slug);
    if (filter === "light") return task.priceKopecks <= 100_000 && !["moving", "shift"].includes(task.category.slug);
    if (filter === "verified") return task.customer.telegramVerified;
    return true;
  }), [filter, tasks]);
  const selectedTask = filteredTasks.find((task) => task.id === selectedTaskId) ?? null;
  const offerSearchHere = hydrated && shouldOfferSearchHere(camera.center, search);

  const loadTasks = useCallback(async (nextSearch: SearchState, force = false) => {
    const key = buildDiscoveryCacheKey(nextSearch);
    const cached = taskCacheRef.current.get(key);
    if (cached) {
      setTasks(cached.value);
      setInitialLoading(false);
      if (!force && cached.ageMs < TASK_CACHE_TTL_MS) return;
    }
    const sequence = taskGuardRef.current.begin();
    taskAbortRef.current?.abort();
    const controller = new AbortController();
    taskAbortRef.current = controller;
    if (cached || hasTaskDataRef.current) setBackgroundRefreshing(true);
    else setInitialLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ latitude: String(nextSearch.anchor.latitude), longitude: String(nextSearch.anchor.longitude), radius: String(nextSearch.radius) });
      const response = await fetch(`/api/tasks/nearby?${params}`, { cache: "no-store", signal: controller.signal });
      const result = await response.json() as { tasks?: TaskFeedItem[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Не удалось загрузить задачи.");
      if (!taskGuardRef.current.isLatest(sequence)) return;
      const nextTasks = result.tasks ?? [];
      taskCacheRef.current.set(key, nextTasks);
      setTasks(nextTasks);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      if (taskGuardRef.current.isLatest(sequence)) setError(cause instanceof Error ? cause.message : "Не удалось обновить задачи.");
    } finally {
      if (taskGuardRef.current.isLatest(sequence)) { setInitialLoading(false); setBackgroundRefreshing(false); }
    }
  }, []);

  const loadExecutors = useCallback(async (nextSearch: SearchState, force = false) => {
    const key = buildDiscoveryCacheKey(nextSearch);
    const cached = executorCacheRef.current.get(key);
    if (cached) {
      setExecutors(cached.value);
      if (!force && cached.ageMs < EXECUTOR_CACHE_TTL_MS) return;
    }
    const sequence = executorGuardRef.current.begin();
    executorAbortRef.current?.abort();
    const controller = new AbortController();
    executorAbortRef.current = controller;
    setExecutorRefreshing(true);
    try {
      const params = new URLSearchParams({ latitude: String(nextSearch.anchor.latitude), longitude: String(nextSearch.anchor.longitude), radius: String(nextSearch.radius) });
      const response = await fetch(`/api/executors/nearby?${params}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) return;
      const result = await response.json() as { executors?: ExecutorPoint[] };
      if (!executorGuardRef.current.isLatest(sequence)) return;
      const nextExecutors = result.executors ?? [];
      executorCacheRef.current.set(key, nextExecutors);
      setExecutors(nextExecutors);
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) return;
    } finally {
      if (executorGuardRef.current.isLatest(sequence)) setExecutorRefreshing(false);
    }
  }, []);

  const loadDiscovery = useCallback((nextSearch: SearchState, force = false) => {
    void loadTasks(nextSearch, force);
    void loadExecutors(nextSearch, force);
  }, [loadExecutors, loadTasks]);

  useEffect(() => {
    const persisted = parsePersistedMapState(window.sessionStorage.getItem(STORAGE_KEY));
    const frame = window.requestAnimationFrame(() => {
      if (persisted) {
        restoredRef.current = true;
        setSearch(persisted.search);
        setCamera(persisted.camera);
        if (FILTERS.some((item) => item.id === persisted.filter)) setFilter(persisted.filter as FilterId);
        setShowTasks(persisted.showTasks);
        setShowExecutors(persisted.showExecutors);
        setSelectedTaskId(persisted.selectedTaskId);
        scrollYRef.current = persisted.scrollY;
        pendingScrollRestoreRef.current = persisted.scrollY;
      }
      setHydrated(true);
    });
    trackMapEvent("map_opened");
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    loadDiscovery(search);
  }, [hydrated, loadDiscovery, search]);

  useEffect(() => {
    if (!hydrated || initialLoading || pendingScrollRestoreRef.current === null) return;
    const target = pendingScrollRestoreRef.current;
    let frame = 0;
    const timer = window.setTimeout(() => {
      frame = window.requestAnimationFrame(() => {
        window.scrollTo({ top: target });
        pendingScrollRestoreRef.current = null;
      });
    }, 200);
    return () => {
      window.clearTimeout(timer);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [hydrated, initialLoading]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setInterval(() => loadDiscovery(searchRef.current), TASK_CACHE_TTL_MS);
    return () => window.clearInterval(timer);
  }, [hydrated, loadDiscovery]);

  useEffect(() => {
    let frame = 0;
    const rememberBeforeNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element).closest("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || !link.getAttribute("href")?.startsWith("/")) return;
      navigationPendingRef.current = true;
      scrollYRef.current = window.scrollY;
      const state = { ...persistedStateRef.current, scrollY: scrollYRef.current };
      persistedStateRef.current = state;
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    };
    const rememberScroll = () => {
      if (navigationPendingRef.current) return;
      scrollYRef.current = window.scrollY;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const state = { ...persistedStateRef.current, scrollY: scrollYRef.current };
        persistedStateRef.current = state;
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      });
    };
    document.addEventListener("click", rememberBeforeNavigation, true);
    window.addEventListener("scroll", rememberScroll, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      document.removeEventListener("click", rememberBeforeNavigation, true);
      window.removeEventListener("scroll", rememberScroll);
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const state: PersistedMapState = { search, camera, filter, showTasks, showExecutors, selectedTaskId, scrollY: scrollYRef.current };
    persistedStateRef.current = state;
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [camera, filter, hydrated, search, selectedTaskId, showExecutors, showTasks]);

  useEffect(() => {
    const persistLatestState = () => {
      const state = { ...persistedStateRef.current, scrollY: window.scrollY };
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    };
    window.addEventListener("pagehide", persistLatestState);
    return () => window.removeEventListener("pagehide", persistLatestState);
  }, []);

  useEffect(() => () => {
    taskGuardRef.current.invalidate(); executorGuardRef.current.invalidate();
    taskAbortRef.current?.abort(); executorAbortRef.current?.abort();
    if (hintTimerRef.current) window.clearTimeout(hintTimerRef.current);
  }, []);

  const saveLocation = useCallback(async (coordinates: Coordinates, accuracy: number) => {
    if (!user) return;
    await fetch("/api/me/location", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...coordinates, accuracyMeters: Math.round(accuracy) }) }).catch(() => undefined);
  }, [user]);

  const applyPosition = useCallback((position: Coordinates, accuracy: number) => {
    setUserCenter(position);
    setHasUserLocation(true);
    setLocating(false);
    setGeoMessage("Показываем задачи рядом с вами");
    if (!restoredRef.current || searchRef.current.mode === "near_me") {
      setSearch((current) => ({ ...current, anchor: position, mode: "near_me" }));
      setCamera((current) => ({ ...current, center: position }));
    }
    void saveLocation(position, accuracy);
  }, [saveLocation]);

  const locate = useCallback((openTelegramSettingsOnDenied = false) => {
    setLocating(true);
    setGeoMessage("Определяем ваше местоположение…");
    const fallback = (message: string) => { setLocating(false); setGeoMessage(message); };
    const requestBrowserLocation = () => {
      if (!navigator.geolocation) { fallback("Геолокация недоступна — показан центр Москвы"); return; }
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => applyPosition({ latitude: coords.latitude, longitude: coords.longitude }, coords.accuracy),
        (geoError) => fallback(geoError.code === geoError.PERMISSION_DENIED ? "Разрешите геопозицию у значка замка в адресной строке" : geoError.code === geoError.TIMEOUT ? "Не дождались координат. Проверьте геолокацию устройства" : "Не удалось определить координаты — показан центр Москвы"),
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
      );
    };
    const telegram = window.Telegram?.WebApp;
    const manager = telegram?.initData && telegram.isVersionAtLeast("8.0") ? telegram.LocationManager : undefined;
    if (!manager) { requestBrowserLocation(); return; }
    const requestTelegramLocation = () => {
      if (!manager.isLocationAvailable) { requestBrowserLocation(); return; }
      manager.getLocation((location) => {
        if (location) { applyPosition({ latitude: location.latitude, longitude: location.longitude }, location.horizontal_accuracy ?? 0); return; }
        if (openTelegramSettingsOnDenied && manager.isAccessRequested && !manager.isAccessGranted) { manager.openSettings(); fallback("Разрешите геопозицию в настройках Telegram и повторите"); return; }
        requestBrowserLocation();
      });
    };
    if (manager.isInited) requestTelegramLocation(); else manager.init(requestTelegramLocation);
  }, [applyPosition]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => locate(false), 300);
    return () => window.clearTimeout(timer);
  }, [hydrated, locate]);

  function changeRadius(radius: SearchState["radius"]) {
    if (radius === search.radius) return;
    telegramSelectionChanged();
    setSearch((current) => ({ ...current, radius }));
    setFitRadiusKey((value) => value + 1);
    trackMapEvent("map_radius_changed", { properties: { radius, mode: search.mode } });
  }

  function searchHere() {
    setSearch((current) => commitMapAreaSearch(current, camera.center));
    setSelectedTaskId(null);
    trackMapEvent("map_search_here", { properties: { radius: search.radius } });
  }

  function returnToMe() {
    if (!hasUserLocation) { locate(true); return; }
    setSearch((current) => commitNearMeSearch(current, userCenter));
    setCamera((current) => ({ ...current, center: userCenter }));
    setSelectedTaskId(null);
    trackMapEvent("map_return_to_me", { properties: { radius: search.radius } });
  }

  function selectTask(taskId: string, focus = false) {
    setSelectedTaskId(taskId);
    if (focus) setFocusTaskKey((value) => value + 1);
    trackMapEvent("map_task_marker_opened", { taskId });
  }

  function showExecutorHint() {
    setExecutorHint(true);
    if (hintTimerRef.current) window.clearTimeout(hintTimerRef.current);
    hintTimerRef.current = window.setTimeout(() => setExecutorHint(false), 3500);
    trackMapEvent("map_executor_marker_opened");
  }

  return (
    <main className="mx-auto min-h-dvh max-w-5xl pb-44">
      <header className="flex items-center justify-between px-5 py-5 sm:px-8"><Link href="/" className="flex items-center gap-3" aria-label="Рядом — главная"><span className="grid size-11 place-items-center rounded-2xl bg-emerald-950 text-white shadow-md"><MapPin className="size-5" /></span><span><b className="block text-lg font-black tracking-tight">Рядом</b><small className="block text-[11px] text-stone-500">помощь за углом</small></span></Link><div className="flex items-center gap-2"><ThemeToggle />{user ? <AccountMenu user={user} /> : <Link href="/login" className="rounded-full bg-white px-4 py-2.5 text-sm font-bold shadow-sm dark:bg-stone-900">Войти</Link>}</div></header>

      <section className="px-4 sm:px-8">
        <div className="mb-4 flex items-end justify-between gap-4"><div><p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-emerald-800 dark:text-emerald-300"><LocateFixed className="size-3.5" />{search.mode === "near_me" ? "Рядом со мной" : "Выбранная область"} · {radiusLabel(search.radius)}</p><h1 className="text-3xl font-black tracking-[-0.04em] sm:text-4xl">Что происходит рядом</h1><p className="mt-1 text-xs text-stone-500">{geoMessage}</p></div><Button type="button" size="icon" variant="outline" onClick={() => locate(true)} disabled={locating} aria-label="Обновить местоположение">{locating ? <LoaderCircle className="size-5 animate-spin" /> : <Crosshair className="size-5" />}</Button></div>

        <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" aria-label="Фильтры задач">{FILTERS.map((item) => <button key={item.id} type="button" onClick={() => { if (filter !== item.id) { setFilter(item.id); setSelectedTaskId(null); telegramSelectionChanged(); } }} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${filter === item.id ? "bg-emerald-950 text-white" : "border border-stone-200 bg-white text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"}`}>{item.label}</button>)}</div>

        <div className="relative">
          <LazyYandexMap apiKey={apiKey} center={search.anchor} initialCameraCenter={camera.center} initialZoom={camera.zoom} userLocation={hasUserLocation ? userCenter : null} tasks={filteredTasks} executors={executors} showTasks={showTasks} showExecutors={showExecutors} selectedTaskId={selectedTaskId} focusTaskId={selectedTaskId} focusTaskKey={focusTaskKey} fitRadiusKey={fitRadiusKey} showAllKey={showAllKey} onCameraSettled={setCamera} onTaskSelect={(id) => selectTask(id)} onClusterOpen={(count) => trackMapEvent("map_cluster_opened", { properties: { count } })} onExecutorSelect={showExecutorHint} searchRadiusMeters={search.radius} className="h-[410px] sm:h-[470px]" />

          <div className="absolute left-3 top-3 z-20 flex flex-col gap-2">
            <div className="flex rounded-xl bg-white/95 p-1 shadow-lg backdrop-blur dark:bg-stone-900/95" aria-label="Слои карты">
              <button type="button" onClick={() => setShowTasks((value) => !value)} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-black" aria-pressed={showTasks}>{showTasks ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}Задачи</button>
              <button type="button" onClick={() => { setShowExecutors((value) => { trackMapEvent("map_executor_layer_toggled", { properties: { visible: !value } }); return !value; }); }} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-black" aria-pressed={showExecutors}>{showExecutors ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}Исполнители</button>
            </div>
            {showExecutors ? <span className="w-fit rounded-lg bg-white/90 px-2 py-1 text-[11px] font-bold text-stone-600 shadow dark:bg-stone-900/90 dark:text-stone-300">{executorRefreshing ? "Обновляем исполнителей…" : `${executors.length} готовы рядом`}</span> : null}
          </div>

          {offerSearchHere ? <button type="button" onClick={searchHere} className="absolute left-1/2 top-16 z-30 inline-flex min-h-11 -translate-x-1/2 items-center gap-2 rounded-full bg-emerald-950 px-4 text-sm font-black text-white shadow-xl"><Search className="size-4" />Искать здесь</button> : null}
          {search.mode === "map_area" ? <button type="button" onClick={returnToMe} className="absolute right-3 top-28 z-20 inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white/95 px-3 text-xs font-black text-emerald-800 shadow-lg backdrop-blur dark:bg-stone-900/95 dark:text-emerald-200"><LocateFixed className="size-4" />Вернуться ко мне</button> : null}
          {executorHint ? <p role="status" className="absolute left-3 top-28 z-30 max-w-[calc(100%-1.5rem)] rounded-full bg-stone-950/90 px-3 py-2 text-xs font-bold text-white">Исполнитель доступен рядом · активен недавно</p> : null}

          {selectedTask ? <TaskMapPreview task={selectedTask} onClose={() => setSelectedTaskId(null)} onOpen={() => trackMapEvent("map_task_opened", { taskId: selectedTask.id })} /> : null}
          <div className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 gap-1 rounded-full bg-white/95 p-1.5 shadow-xl backdrop-blur dark:bg-stone-900/95">{RADII.map((value) => <button key={value} type="button" onClick={() => changeRadius(value)} className={`min-h-10 rounded-full px-3 text-sm font-bold transition sm:px-4 ${search.radius === value ? "bg-emerald-950 text-white" : "text-stone-600 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800"}`}>{radiusLabel(value)}</button>)}</div>
        </div>
      </section>

      <section className="px-4 pt-8 sm:px-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black">Задачи поблизости</h2><p className="text-sm text-stone-500">{initialLoading ? "Ищем…" : `${filteredTasks.length} ${filteredTasks.length === 1 ? "задача" : "задач"} на карте и в списке`}{backgroundRefreshing ? " · Обновляем…" : ""}</p></div><div className="flex items-center gap-1"><Button variant="ghost" size="sm" onClick={() => { if (filteredTasks.length) setShowAllKey((value) => value + 1); }} disabled={!filteredTasks.length}><Layers3 className="size-4" />Показать все {filteredTasks.length || ""}</Button><Button variant="ghost" size="sm" onClick={() => loadDiscovery(search, true)} disabled={backgroundRefreshing}><RefreshCw className={`size-4 ${backgroundRefreshing ? "animate-spin" : ""}`} />Обновить</Button></div></div>

        {error ? <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-200"><span>Не удалось обновить. Старые данные сохранены.</span><button type="button" onClick={() => loadDiscovery(search, true)} className="font-black underline">Повторить</button></div> : null}
        {initialLoading && tasks.length === 0 ? <div className="grid min-h-44 place-items-center text-sm text-stone-500"><span className="flex items-center gap-2"><LoaderCircle className="size-5 animate-spin" />Собираем задачи рядом</span></div> : filteredTasks.length ? <div className="grid gap-3 md:grid-cols-2">{filteredTasks.map((task) => <TaskCard key={task.id} task={task} selected={task.id === selectedTaskId} onShowOnMap={() => selectTask(task.id, true)} />)}</div> : <div className="rounded-3xl border border-dashed border-stone-300 bg-white/50 p-8 text-center dark:border-stone-700 dark:bg-stone-900/40"><MapPin className="mx-auto mb-3 size-8 text-stone-400" /><h3 className="font-bold">В этой области пока нет задач</h3><p className="mt-1 text-sm text-stone-500">Увеличьте радиус, вернитесь к себе или передвиньте карту и нажмите «Искать здесь».</p><div className="mt-4 flex flex-wrap justify-center gap-2">{search.radius < 3000 ? <Button type="button" variant="outline" onClick={() => changeRadius(search.radius === 500 ? 1000 : 3000)}>Увеличить радиус</Button> : null}{search.mode === "map_area" ? <Button type="button" variant="outline" onClick={returnToMe}>Вернуться ко мне</Button> : null}</div></div>}
      </section>

      <div className="above-bottom-nav fixed inset-x-0 z-30 px-4 py-3"><div className="mx-auto flex max-w-5xl items-center justify-center gap-2"><CreateTaskModal categories={categories} apiKey={apiKey} initialCoordinates={hasUserLocation ? userCenter : search.anchor} isAuthenticated={Boolean(user)} initialValues={repeatPrefill} initiallyOpen={Boolean(repeatPrefill)} /></div></div>
    </main>
  );
}
