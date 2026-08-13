"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, MapPinOff } from "lucide-react";

import { circlePolygon, radiusBounds, type MapCameraSnapshot } from "@/lib/map/discovery";
import { isTaskAvailableStatus } from "@/lib/tasks/policy";
import type { Coordinates, ExecutorPoint, TaskFeedItem } from "@/types/task";

type LngLat = [number, number];
type Bounds = [LngLat, LngLat];
type MapEntity = {
  addChild(child: MapEntity): MapEntity;
  removeChild?(child: MapEntity): MapEntity;
  update?(props: Record<string, unknown>): void;
  destroy?(): void;
};

type TaskFeature = {
  type: "Feature";
  id: string;
  geometry: { type: "Point"; coordinates: LngLat };
  properties: { task: TaskFeedItem };
};

type ExecutorFeature = {
  type: "Feature";
  id: string;
  geometry: { type: "Point"; coordinates: LngLat };
  properties: Record<string, never>;
};

type YMaps3 = {
  ready: Promise<void>;
  import: ((name: string) => Promise<Record<string, unknown>>) & { registerCdn(template: string, packages: string[]): void };
  YMap: new (element: HTMLElement, props: Record<string, unknown>) => MapEntity;
  YMapDefaultSchemeLayer: new (props?: Record<string, unknown>) => MapEntity;
  YMapDefaultFeaturesLayer: new (props?: Record<string, unknown>) => MapEntity;
  YMapFeature: new (props: Record<string, unknown>) => MapEntity;
  YMapFeatureDataSource: new (props: Record<string, unknown>) => MapEntity;
  YMapLayer: new (props: Record<string, unknown>) => MapEntity;
  YMapMarker: new (props: Record<string, unknown>, element: HTMLElement) => MapEntity;
  YMapListener: new (props: Record<string, unknown>) => MapEntity;
};

declare global {
  interface Window { ymaps3?: YMaps3 }
}

let yandexMapsPromise: Promise<YMaps3> | null = null;
let packagesRegistered = false;

function registerYandexPackages(ymaps3: YMaps3) {
  if (!packagesRegistered) {
    ymaps3.import.registerCdn("https://cdn.jsdelivr.net/npm/{package}", ["@yandex/ymaps3-clusterer@0.0"]);
    packagesRegistered = true;
  }
  return ymaps3;
}

function loadYandexMaps(apiKey: string): Promise<YMaps3> {
  if (yandexMapsPromise) return yandexMapsPromise;
  if (window.ymaps3) {
    const existing = window.ymaps3;
    yandexMapsPromise = existing.ready.then(() => registerYandexPackages(existing));
    return yandexMapsPromise;
  }
  yandexMapsPromise = new Promise<YMaps3>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://api-maps.yandex.ru/v3/?apikey=${encodeURIComponent(apiKey)}&lang=ru_RU`;
    script.async = true;
    script.onload = async () => {
      try {
        if (!window.ymaps3) throw new Error("Yandex Maps API не загрузился");
        await window.ymaps3.ready;
        resolve(registerYandexPackages(window.ymaps3));
      } catch (error) { reject(error); }
    };
    script.onerror = () => reject(new Error("Не удалось загрузить Яндекс Карты"));
    document.head.appendChild(script);
  }).catch((error) => {
    yandexMapsPromise = null;
    throw error;
  });
  return yandexMapsPromise;
}

function boundsForPoints(points: LngLat[]): Bounds | null {
  if (!points.length) return null;
  let minLng = points[0][0];
  let maxLng = points[0][0];
  let minLat = points[0][1];
  let maxLat = points[0][1];
  for (const [lng, lat] of points.slice(1)) {
    minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
  }
  if (minLng === maxLng && minLat === maxLat) return [[minLng - 0.002, minLat - 0.0015], [maxLng + 0.002, maxLat + 0.0015]];
  return [[minLng, minLat], [maxLng, maxLat]];
}

export type YandexMapProps = {
  apiKey: string;
  center: Coordinates;
  initialCameraCenter?: Coordinates;
  initialZoom?: number;
  userLocation?: Coordinates | null;
  tasks?: TaskFeedItem[];
  executors?: ExecutorPoint[];
  showTasks?: boolean;
  showExecutors?: boolean;
  selectedTaskId?: string | null;
  focusTaskId?: string | null;
  focusTaskKey?: number;
  fitRadiusKey?: number;
  showAllKey?: number;
  selectable?: boolean;
  selectedPoint?: Coordinates | null;
  onPointSelect?: (point: Coordinates) => void;
  onCameraSettled?: (camera: MapCameraSnapshot) => void;
  onTaskSelect?: (taskId: string) => void;
  onClusterOpen?: (count: number) => void;
  onExecutorSelect?: () => void;
  searchRadiusMeters?: number;
  className?: string;
};

export function YandexMap({
  apiKey,
  center,
  initialCameraCenter,
  initialZoom = 14,
  userLocation,
  tasks = [],
  executors = [],
  showTasks = true,
  showExecutors = true,
  selectedTaskId,
  focusTaskId,
  focusTaskKey = 0,
  fitRadiusKey = 0,
  showAllKey = 0,
  selectable = false,
  selectedPoint,
  onPointSelect,
  onCameraSettled,
  onTaskSelect,
  onClusterOpen,
  onExecutorSelect,
  searchRadiusMeters,
  className = "h-[340px]",
}: YandexMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapEntity | null>(null);
  const ymapsRef = useRef<YMaps3 | null>(null);
  const taskClusterRef = useRef<MapEntity | null>(null);
  const executorClusterRef = useRef<MapEntity | null>(null);
  const userMarkerRef = useRef<MapEntity | null>(null);
  const selectedPointMarkerRef = useRef<MapEntity | null>(null);
  const radiusFeatureRef = useRef<MapEntity | null>(null);
  const taskLayerSequenceRef = useRef(0);
  const executorLayerSequenceRef = useRef(0);
  const selectedTaskIdRef = useRef(selectedTaskId);
  const cameraRef = useRef<MapCameraSnapshot>({ center: initialCameraCenter ?? center, zoom: initialZoom });
  const mountedRef = useRef(false);
  const lastExternalCenterRef = useRef(center);
  const callbacksRef = useRef({ onPointSelect, onCameraSettled, onTaskSelect, onClusterOpen, onExecutorSelect });
  const selectableRef = useRef(selectable);
  const [readyVersion, setReadyVersion] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    callbacksRef.current = { onPointSelect, onCameraSettled, onTaskSelect, onClusterOpen, onExecutorSelect };
  }, [onCameraSettled, onClusterOpen, onExecutorSelect, onPointSelect, onTaskSelect]);
  useEffect(() => { selectableRef.current = selectable; }, [selectable]);
  useEffect(() => {
    selectedTaskIdRef.current = selectedTaskId;
    containerRef.current?.querySelectorAll<HTMLElement>(".map-task-marker[data-task-id]").forEach((element) => {
      element.classList.toggle("map-task-marker-selected", element.dataset.taskId === selectedTaskId);
    });
  }, [selectedTaskId]);

  useEffect(() => {
    let disposed = false;
    const container = containerRef.current;
    if (!container) return;
    async function mountMap() {
      if (!apiKey) { setError("Не задан ключ Яндекс Карт"); setLoading(false); return; }
      try {
        const ymaps3 = await loadYandexMaps(apiKey);
        if (disposed) return;
        const map = new ymaps3.YMap(container!, {
          location: { center: [cameraRef.current.center.longitude, cameraRef.current.center.latitude], zoom: cameraRef.current.zoom },
          mode: "vector",
          behaviors: ["drag", "pinchZoom", "dblClick", "scrollZoom"],
        });
        map.addChild(new ymaps3.YMapDefaultSchemeLayer()).addChild(new ymaps3.YMapDefaultFeaturesLayer({ zIndex: 1800 }));
        map.addChild(new ymaps3.YMapFeatureDataSource({ id: "tasks-source" })).addChild(new ymaps3.YMapLayer({ source: "tasks-source", type: "markers", zIndex: 2000 }));
        map.addChild(new ymaps3.YMapFeatureDataSource({ id: "executors-source" })).addChild(new ymaps3.YMapLayer({ source: "executors-source", type: "markers", zIndex: 1870 }));
        map.addChild(new ymaps3.YMapListener({
          layer: "any",
          onUpdate: (event: { location?: { center?: LngLat; zoom?: number } }) => {
            const nextCenter = event.location?.center;
            if (nextCenter) cameraRef.current.center = { longitude: nextCenter[0], latitude: nextCenter[1] };
            if (typeof event.location?.zoom === "number") cameraRef.current.zoom = event.location.zoom;
          },
          onActionEnd: () => callbacksRef.current.onCameraSettled?.({
            center: { ...cameraRef.current.center },
            zoom: cameraRef.current.zoom,
          }),
          onClick: (_object: unknown, event: { coordinates: LngLat }) => {
            if (selectableRef.current) callbacksRef.current.onPointSelect?.({ longitude: event.coordinates[0], latitude: event.coordinates[1] });
          },
        }));
        mapRef.current = map;
        ymapsRef.current = ymaps3;
        mountedRef.current = true;
        setLoading(false);
        setReadyVersion((value) => value + 1);
      } catch (cause) {
        if (!disposed) { setError(cause instanceof Error ? cause.message : "Не удалось открыть карту"); setLoading(false); }
      }
    }
    void mountMap();
    return () => {
      disposed = true;
      mountedRef.current = false;
      taskLayerSequenceRef.current += 1;
      executorLayerSequenceRef.current += 1;
      mapRef.current?.destroy?.();
      mapRef.current = null;
      ymapsRef.current = null;
      container.innerHTML = "";
    };
  }, [apiKey, retryKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mountedRef.current) return;
    const previous = lastExternalCenterRef.current;
    if (previous.latitude === center.latitude && previous.longitude === center.longitude) return;
    lastExternalCenterRef.current = center;
    cameraRef.current.center = center;
    map.update?.({ location: { center: [center.longitude, center.latitude], zoom: cameraRef.current.zoom, duration: 350 } });
  }, [center, readyVersion]);

  useEffect(() => {
    const map = mapRef.current;
    const ymaps3 = ymapsRef.current;
    if (!map || !ymaps3) return;
    if (userLocation === null) {
      if (userMarkerRef.current) { map.removeChild?.(userMarkerRef.current); userMarkerRef.current = null; }
      return;
    }
    const point = userLocation ?? center;
    if (!userMarkerRef.current) {
      const element = document.createElement("div");
      element.className = "map-user-marker";
      element.title = "Вы";
      element.setAttribute("aria-label", "Ваше местоположение");
      userMarkerRef.current = new ymaps3.YMapMarker({ coordinates: [point.longitude, point.latitude], zIndex: 2100 }, element);
      map.addChild(userMarkerRef.current);
    } else userMarkerRef.current.update?.({ coordinates: [point.longitude, point.latitude] });
  }, [center, readyVersion, userLocation]);

  useEffect(() => {
    const map = mapRef.current;
    const ymaps3 = ymapsRef.current;
    if (!map || !ymaps3 || !searchRadiusMeters) return;
    const props = {
      id: "search-radius",
      geometry: { type: "Polygon", coordinates: circlePolygon(center, searchRadiusMeters) },
      style: { simplificationRate: 0, stroke: [{ color: "rgba(5, 150, 105, 0.72)", width: 2 }], fill: "rgba(16, 185, 129, 0.10)" },
      zIndex: 1820,
    };
    if (!radiusFeatureRef.current) {
      radiusFeatureRef.current = new ymaps3.YMapFeature(props);
      map.addChild(radiusFeatureRef.current);
    } else radiusFeatureRef.current.update?.(props);
  }, [center, readyVersion, searchRadiusMeters]);

  useEffect(() => {
    if (!fitRadiusKey || !mapRef.current || !searchRadiusMeters) return;
    mapRef.current.update?.({ location: { bounds: radiusBounds(center, searchRadiusMeters), duration: 350 } });
  }, [center, fitRadiusKey, readyVersion, searchRadiusMeters]);

  useEffect(() => {
    const map = mapRef.current;
    const ymaps3 = ymapsRef.current;
    if (!map || !ymaps3) return;
    if (selectedPointMarkerRef.current) {
      map.removeChild?.(selectedPointMarkerRef.current);
      selectedPointMarkerRef.current = null;
    }
    const point = selectedPoint ?? (selectable ? center : null);
    if (!point) return;
    const element = document.createElement("div");
    element.className = "map-selected-marker";
    element.title = "Место задачи";
    selectedPointMarkerRef.current = new ymaps3.YMapMarker({ coordinates: [point.longitude, point.latitude], zIndex: 2200 }, element);
    map.addChild(selectedPointMarkerRef.current);
  }, [center, readyVersion, selectable, selectedPoint]);

  useEffect(() => {
    const map = mapRef.current;
    const ymaps3 = ymapsRef.current;
    if (!map || !ymaps3) return;
    const sequence = ++taskLayerSequenceRef.current;
    if (taskClusterRef.current) { map.removeChild?.(taskClusterRef.current); taskClusterRef.current = null; }
    if (!showTasks || !tasks.length) return;
    void ymaps3.import("@yandex/ymaps3-clusterer").then((module) => {
      if (sequence !== taskLayerSequenceRef.current || !mapRef.current) return;
      const YMapClusterer = module.YMapClusterer as new (props: Record<string, unknown>) => MapEntity;
      const clusterByGrid = module.clusterByGrid as (props: { gridSize: number }) => unknown;
      const features: TaskFeature[] = tasks.map((task) => ({ type: "Feature", id: task.id, geometry: { type: "Point", coordinates: [task.longitude, task.latitude] }, properties: { task } }));
      const marker = (feature: TaskFeature) => {
        const task = feature.properties.task;
        const element = document.createElement("button");
        element.type = "button";
        const urgent = task.isUrgent && isTaskAvailableStatus(task.status);
        const selected = task.id === selectedTaskIdRef.current;
        element.className = `map-task-marker${urgent ? " map-task-marker-urgent" : ""}${selected ? " map-task-marker-selected" : ""}`;
        element.dataset.taskId = task.id;
        element.textContent = `${urgent ? "⚡ " : ""}${Math.round(task.priceKopecks / 100).toLocaleString("ru-RU")} ₽`;
        element.title = `${task.title}. Открыть краткую информацию`;
        element.setAttribute("aria-label", `${task.title}, ${Math.round(task.priceKopecks / 100)} рублей`);
        element.addEventListener("click", (event) => { event.stopPropagation(); callbacksRef.current.onTaskSelect?.(task.id); });
        return new ymaps3.YMapMarker({ coordinates: feature.geometry.coordinates, source: "tasks-source", zIndex: 2000 }, element);
      };
      const cluster = (coordinates: LngLat, items: TaskFeature[]) => {
        const element = document.createElement("button");
        element.type = "button";
        element.className = "map-cluster-marker";
        element.textContent = String(items.length);
        element.title = `Показать ${items.length} задач рядом`;
        element.addEventListener("click", (event) => {
          event.stopPropagation();
          const bounds = boundsForPoints(items.map((item) => item.geometry.coordinates));
          if (bounds) mapRef.current?.update?.({ location: { bounds, duration: 350 } });
          callbacksRef.current.onClusterOpen?.(items.length);
        });
        return new ymaps3.YMapMarker({ coordinates, source: "tasks-source" }, element);
      };
      const entity = new YMapClusterer({ method: clusterByGrid({ gridSize: 72 }), features, marker, cluster });
      taskClusterRef.current = entity;
      mapRef.current.addChild(entity);
    }).catch(() => undefined);
    return () => { taskLayerSequenceRef.current += 1; };
  }, [readyVersion, showTasks, tasks]);

  useEffect(() => {
    const map = mapRef.current;
    const ymaps3 = ymapsRef.current;
    if (!map || !ymaps3) return;
    const sequence = ++executorLayerSequenceRef.current;
    if (executorClusterRef.current) { map.removeChild?.(executorClusterRef.current); executorClusterRef.current = null; }
    if (!showExecutors || !executors.length) return;
    void ymaps3.import("@yandex/ymaps3-clusterer").then((module) => {
      if (sequence !== executorLayerSequenceRef.current || !mapRef.current) return;
      const YMapClusterer = module.YMapClusterer as new (props: Record<string, unknown>) => MapEntity;
      const clusterByGrid = module.clusterByGrid as (props: { gridSize: number }) => unknown;
      const features: ExecutorFeature[] = executors.map((executor, index) => ({ type: "Feature", id: `executor-${index}`, geometry: { type: "Point", coordinates: [executor.longitude, executor.latitude] }, properties: {} }));
      const marker = (feature: ExecutorFeature) => {
        const element = document.createElement("button");
        element.type = "button";
        element.className = "map-live-executor";
        element.title = "Исполнитель доступен рядом · активен недавно";
        element.setAttribute("aria-label", "Исполнитель доступен рядом");
        element.addEventListener("click", (event) => { event.stopPropagation(); callbacksRef.current.onExecutorSelect?.(); });
        return new ymaps3.YMapMarker({ coordinates: feature.geometry.coordinates, source: "executors-source" }, element);
      };
      const cluster = (coordinates: LngLat, items: ExecutorFeature[]) => {
        const element = document.createElement("button");
        element.type = "button";
        element.className = "map-executor-cluster";
        element.textContent = String(items.length);
        element.title = `${items.length} исполнителей доступны в этой области`;
        element.addEventListener("click", (event) => {
          event.stopPropagation();
          const bounds = boundsForPoints(items.map((item) => item.geometry.coordinates));
          if (bounds) mapRef.current?.update?.({ location: { bounds, duration: 350 } });
        });
        return new ymaps3.YMapMarker({ coordinates, source: "executors-source" }, element);
      };
      const entity = new YMapClusterer({ method: clusterByGrid({ gridSize: 56 }), features, marker, cluster });
      executorClusterRef.current = entity;
      mapRef.current.addChild(entity);
    }).catch(() => undefined);
    return () => { executorLayerSequenceRef.current += 1; };
  }, [executors, readyVersion, showExecutors]);

  useEffect(() => {
    if (!focusTaskKey || !focusTaskId || !mapRef.current) return;
    const task = tasks.find((item) => item.id === focusTaskId);
    if (task) mapRef.current.update?.({ location: { center: [task.longitude, task.latitude], zoom: Math.max(cameraRef.current.zoom, 15), duration: 350 } });
  }, [focusTaskId, focusTaskKey, readyVersion, tasks]);

  useEffect(() => {
    if (!showAllKey || !mapRef.current || !tasks.length) return;
    const bounds = boundsForPoints(tasks.map((task) => [task.longitude, task.latitude]));
    if (bounds) mapRef.current.update?.({ location: { bounds, duration: 350 } });
  }, [readyVersion, showAllKey, tasks]);

  return (
    <div className={`relative isolate z-0 overflow-hidden rounded-[1.75rem] bg-stone-200 dark:bg-stone-800 ${className}`}>
      <div ref={containerRef} className="absolute inset-0" />
      {loading && <div className="absolute inset-0 grid place-items-center bg-stone-100/80 text-sm text-stone-600 dark:bg-stone-900/80 dark:text-stone-300"><span className="flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" /> Загружаем карту</span></div>}
      {error && <div className="absolute inset-0 grid place-items-center bg-stone-100 p-6 text-center text-sm text-stone-600 dark:bg-stone-900 dark:text-stone-300"><div><MapPinOff className="mx-auto mb-2 size-6" /><p>{error}</p><button type="button" className="mt-3 rounded-xl bg-stone-900 px-4 py-2 font-medium text-white dark:bg-stone-700" onClick={() => { setError(""); setLoading(true); setRetryKey((value) => value + 1); }}>Повторить</button></div></div>}
      {!error && <a href={`https://yandex.ru/maps/?pt=${center.longitude},${center.latitude}&z=16&l=map`} target="_blank" rel="noreferrer noopener" className="absolute right-2 top-2 z-10 hidden rounded-lg bg-white/95 px-2.5 py-1.5 text-[11px] font-medium text-stone-700 shadow-sm ring-1 ring-black/10 hover:bg-white sm:block">Открыть в Яндекс Картах</a>}
    </div>
  );
}
