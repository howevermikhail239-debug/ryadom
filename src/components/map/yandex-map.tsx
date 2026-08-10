"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, MapPinOff } from "lucide-react";

import type { Coordinates, ExecutorPoint, TaskFeedItem } from "@/types/task";

type LngLat = [number, number];
type MapEntity = {
  addChild(child: MapEntity): MapEntity;
  update?(props: Record<string, unknown>): void;
  destroy?(): void;
};

type MarkerFeature = {
  type: "Feature";
  id: string;
  geometry: { type: "Point"; coordinates: LngLat };
  properties: { task: TaskFeedItem };
};

type YMaps3 = {
  ready: Promise<void>;
  import: ((name: string) => Promise<Record<string, unknown>>) & {
    registerCdn(template: string, packages: string[]): void;
  };
  YMap: new (element: HTMLElement, props: Record<string, unknown>) => MapEntity;
  YMapDefaultSchemeLayer: new (props?: Record<string, unknown>) => MapEntity;
  YMapDefaultFeaturesLayer: new (props?: Record<string, unknown>) => MapEntity;
  YMapFeatureDataSource: new (props: Record<string, unknown>) => MapEntity;
  YMapLayer: new (props: Record<string, unknown>) => MapEntity;
  YMapMarker: new (props: Record<string, unknown>, element: HTMLElement) => MapEntity;
  YMapListener: new (props: Record<string, unknown>) => MapEntity;
};

declare global {
  interface Window {
    ymaps3?: YMaps3;
  }
}

let yandexMapsPromise: Promise<YMaps3> | null = null;

function registerYandexPackages(ymaps3: YMaps3): YMaps3 {
  ymaps3.import.registerCdn("https://cdn.jsdelivr.net/npm/{package}", [
    "@yandex/ymaps3-clusterer@0.0",
  ]);
  return ymaps3;
}

function loadYandexMaps(apiKey: string): Promise<YMaps3> {
  if (yandexMapsPromise) return yandexMapsPromise;
  if (window.ymaps3) {
    const existingYmaps = window.ymaps3;
    yandexMapsPromise = existingYmaps.ready.then(() => registerYandexPackages(existingYmaps));
    return yandexMapsPromise;
  }

  const promise = new Promise<YMaps3>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://api-maps.yandex.ru/v3/?apikey=${encodeURIComponent(apiKey)}&lang=ru_RU`;
    script.async = true;
    script.onload = async () => {
      try {
        if (!window.ymaps3) throw new Error("Yandex Maps API не загрузился");
        await window.ymaps3.ready;
        resolve(registerYandexPackages(window.ymaps3));
      } catch (error) {
        reject(error);
      }
    };
    script.onerror = () => reject(new Error("Не удалось загрузить Яндекс Карты"));
    document.head.appendChild(script);
  });

  yandexMapsPromise = promise.catch((error) => {
    yandexMapsPromise = null;
    throw error;
  });
  return yandexMapsPromise;
}

export function YandexMap({
  apiKey,
  center,
  tasks = [],
  executors = [],
  selectable = false,
  selectedPoint,
  onPointSelect,
  onCameraChange,
  searchRadiusMeters,
  className = "h-[340px]",
}: {
  apiKey: string;
  center: Coordinates;
  tasks?: TaskFeedItem[];
  executors?: ExecutorPoint[];
  selectable?: boolean;
  selectedPoint?: Coordinates | null;
  onPointSelect?: (point: Coordinates) => void;
  onCameraChange?: (point: Coordinates) => void;
  searchRadiusMeters?: number;
  className?: string;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const cameraCenterRef = useRef<Coordinates>(center);
  const externalCenterRef = useRef<Coordinates>(center);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (externalCenterRef.current.latitude !== center.latitude || externalCenterRef.current.longitude !== center.longitude) {
      externalCenterRef.current = center;
      cameraCenterRef.current = center;
    }
  }, [center]);

  useEffect(() => {
    let disposed = false;
    let map: MapEntity | null = null;
    const urgentTimers: number[] = [];
    const container = containerRef.current;
    if (!container) return;

    async function mountMap(containerElement: HTMLDivElement) {
      if (!apiKey) {
        setError("Не задан ключ Яндекс Карт");
        setLoading(false);
        return;
      }

      try {
        const ymaps3 = await loadYandexMaps(apiKey);
        if (disposed) return;

        map = new ymaps3.YMap(containerElement, {
          location: { center: [cameraCenterRef.current.longitude, cameraCenterRef.current.latitude], zoom: tasks.length ? 14 : 16 },
          mode: "vector",
          behaviors: ["drag", "pinchZoom", "dblClick", "scrollZoom"],
        });
        map
          .addChild(new ymaps3.YMapDefaultSchemeLayer())
          .addChild(new ymaps3.YMapDefaultFeaturesLayer({ zIndex: 1800 }));

        if (onCameraChange) map.addChild(new ymaps3.YMapListener({ onUpdate: (event: { location?: { center?: LngLat } }) => { const point = event.location?.center; if (point) { const nextCenter = { longitude: point[0], latitude: point[1] }; cameraCenterRef.current = nextCenter; onCameraChange(nextCenter); } } }));

        const userElement = document.createElement("div");
        userElement.className = "map-user-marker";
        userElement.title = "Вы здесь";
        map.addChild(
          new ymaps3.YMapMarker(
            { coordinates: [center.longitude, center.latitude], zIndex: 1900 },
            userElement,
          ),
        );
        if (searchRadiusMeters) {
          const radar = document.createElement("div");
          radar.className = "map-search-radar";
          const radiusLabel = searchRadiusMeters >= 1000 ? `${searchRadiusMeters / 1000} км` : `${searchRadiusMeters} м`;
          radar.title = `Радиус поиска ${radiusLabel}`;
          radar.innerHTML = `<span>${radiusLabel}</span>`;
          map.addChild(new ymaps3.YMapMarker({ coordinates: [center.longitude, center.latitude], zIndex: 1850 }, radar));
        }

        executors.forEach((executor) => {
          const element = document.createElement("div");
          element.className = "map-live-executor";
          element.title = "Исполнитель недавно был онлайн";
          map?.addChild(new ymaps3.YMapMarker({ coordinates: [executor.longitude, executor.latitude], zIndex: 1870 }, element));
        });

        if (tasks.length) {
          const sourceId = "tasks-source";
          map
            .addChild(new ymaps3.YMapFeatureDataSource({ id: sourceId }))
            .addChild(new ymaps3.YMapLayer({ source: sourceId, type: "markers", zIndex: 2000 }));

          const clusterModule = await ymaps3.import("@yandex/ymaps3-clusterer");
          const YMapClusterer = clusterModule.YMapClusterer as new (props: Record<string, unknown>) => MapEntity;
          const clusterByGrid = clusterModule.clusterByGrid as (props: { gridSize: number }) => unknown;
          const features: MarkerFeature[] = tasks.map((task) => ({
            type: "Feature",
            id: task.id,
            geometry: { type: "Point", coordinates: [task.longitude, task.latitude] },
            properties: { task },
          }));

          const marker = (feature: MarkerFeature) => {
            const element = document.createElement("button");
            element.type = "button";
            const task = feature.properties.task;
            const urgentActive = task.isUrgent && ["PUBLISHED", "MATCHING"].includes(task.status);
            element.className = urgentActive ? "map-task-marker map-task-marker-urgent" : "map-task-marker";
            const renderLabel = () => {
              if (!urgentActive) {
                element.textContent = `${task.priceKopecks / 100} ₽`;
                return;
              }
              const seconds = Math.max(0, Math.floor((new Date(task.expiresAt).getTime() - Date.now()) / 1000));
              element.textContent = `⚡ ${task.priceKopecks / 100} ₽ · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
            };
            renderLabel();
            if (urgentActive) urgentTimers.push(window.setInterval(renderLabel, 1000));
            element.title = feature.properties.task.title;
            element.addEventListener("click", () => {
              router.push(`/tasks/${feature.id}`);
            });
            return new ymaps3.YMapMarker(
              { coordinates: feature.geometry.coordinates, source: sourceId },
              element,
            );
          };

          const cluster = (coordinates: LngLat, featuresInCluster: MarkerFeature[]) => {
            const element = document.createElement("button");
            element.type = "button";
            element.className = "map-cluster-marker";
            element.textContent = String(featuresInCluster.length);
            element.title = `Задач рядом: ${featuresInCluster.length}`;
            element.addEventListener("click", () => {
              map?.update?.({ location: { center: coordinates, zoom: 16, duration: 300 } });
            });
            return new ymaps3.YMapMarker({ coordinates, source: sourceId }, element);
          };

          map.addChild(
            new YMapClusterer({
              method: clusterByGrid({ gridSize: 64 }),
              features,
              marker,
              cluster,
            }),
          );
        }

        const chosenPoint = selectedPoint ?? (selectable ? center : null);
        if (chosenPoint) {
          const selectedElement = document.createElement("div");
          selectedElement.className = "map-selected-marker";
          selectedElement.title = "Место задачи";
          map.addChild(
            new ymaps3.YMapMarker(
              { coordinates: [chosenPoint.longitude, chosenPoint.latitude], zIndex: 2200 },
              selectedElement,
            ),
          );
        }

        if (selectable && onPointSelect) {
          map.addChild(
            new ymaps3.YMapListener({
              layer: "any",
              onClick: (_object: unknown, event: { coordinates: LngLat }) => {
                onPointSelect({ longitude: event.coordinates[0], latitude: event.coordinates[1] });
              },
            }),
          );
        }

        setLoading(false);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Не удалось открыть карту");
        setLoading(false);
      }
    }

    void mountMap(container);
    return () => {
      disposed = true;
      urgentTimers.forEach((timer) => window.clearInterval(timer));
      map?.destroy?.();
      container.innerHTML = "";
    };
  }, [apiKey, center, executors, onCameraChange, onPointSelect, retryKey, router, searchRadiusMeters, selectable, selectedPoint, tasks]);

  return (
    <div className={`relative overflow-hidden rounded-[1.75rem] bg-stone-200 ${className}`}>
      <div ref={containerRef} className="absolute inset-0" />
      {loading && (
        <div className="absolute inset-0 grid place-items-center bg-stone-100/80 text-sm text-stone-600">
          <span className="flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" /> Загружаем карту</span>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-stone-100 p-6 text-center text-sm text-stone-600">
          <div>
            <MapPinOff className="mx-auto mb-2 size-6" />
            <p>{error}</p>
            <button
              type="button"
              className="mt-3 rounded-xl bg-stone-900 px-4 py-2 font-medium text-white hover:bg-stone-700"
              onClick={() => {
                setError("");
                setLoading(true);
                setRetryKey((value) => value + 1);
              }}
            >
              Повторить
            </button>
          </div>
        </div>
      )}
      {!error && (
        <a
          href={`https://yandex.ru/maps/?pt=${center.longitude},${center.latitude}&z=16&l=map`}
          target="_blank"
          rel="noreferrer noopener"
          className="absolute bottom-2 right-2 rounded-lg bg-white/95 px-2.5 py-1.5 text-[11px] font-medium text-stone-700 shadow-sm ring-1 ring-black/10 hover:bg-white"
        >
          Открыть в Яндекс Картах
        </a>
      )}
    </div>
  );
}
