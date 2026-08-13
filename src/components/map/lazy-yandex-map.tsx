"use client";

import dynamic from "next/dynamic";
import type { YandexMapProps } from "./yandex-map";

const MapSkeleton = () => <div className="grid h-full min-h-56 place-items-center rounded-[1.75rem] bg-stone-100 text-sm text-stone-500" role="status" aria-label="Загружаем карту"><span className="animate-pulse">Загружаем карту…</span></div>;

const DynamicYandexMap = dynamic(() => import("./yandex-map").then((module) => module.YandexMap), { ssr: false, loading: MapSkeleton });

export function LazyYandexMap({ className = "h-[340px]", ...props }: YandexMapProps) {
  return <div className={className}><DynamicYandexMap {...props} className="h-full" /></div>;
}
