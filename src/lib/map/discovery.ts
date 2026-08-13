import type { Coordinates } from "@/types/task";

export const TASK_CACHE_TTL_MS = 20_000;
export const EXECUTOR_CACHE_TTL_MS = 45_000;
export const MAP_CACHE_MAX_ENTRIES = 15;

export type SearchMode = "near_me" | "map_area";
export type SearchState = {
  anchor: Coordinates;
  radius: 500 | 1000 | 3000;
  mode: SearchMode;
};

export type MapCameraSnapshot = { center: Coordinates; zoom: number };

export type PersistedMapState = {
  search: SearchState;
  camera: MapCameraSnapshot;
  filter: string;
  showTasks: boolean;
  showExecutors: boolean;
  selectedTaskId: string | null;
  scrollY: number;
};

const EARTH_RADIUS_METERS = 6_371_000;

function radians(value: number) {
  return value * Math.PI / 180;
}

export function distanceMeters(a: Coordinates, b: Coordinates): number {
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const latDelta = lat2 - lat1;
  const lngDelta = radians(b.longitude - a.longitude);
  const h = Math.sin(latDelta / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(lngDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function shouldOfferSearchHere(cameraCenter: Coordinates, search: SearchState): boolean {
  return distanceMeters(cameraCenter, search.anchor) > Math.max(50, search.radius * 0.1);
}

export function commitMapAreaSearch(search: SearchState, cameraCenter: Coordinates): SearchState {
  return { ...search, anchor: { ...cameraCenter }, mode: "map_area" };
}

export function commitNearMeSearch(search: SearchState, userLocation: Coordinates): SearchState {
  return { ...search, anchor: { ...userLocation }, mode: "near_me" };
}

export function buildDiscoveryCacheKey(search: SearchState): string {
  return [search.anchor.latitude.toFixed(5), search.anchor.longitude.toFixed(5), search.radius].join(":");
}

export function radiusBounds(center: Coordinates, radiusMeters: number): [[number, number], [number, number]] {
  const latDelta = radiusMeters / 111_320;
  const longitudeScale = Math.max(0.1, Math.cos(radians(center.latitude)));
  const lngDelta = radiusMeters / (111_320 * longitudeScale);
  return [
    [center.longitude - lngDelta, center.latitude - latDelta],
    [center.longitude + lngDelta, center.latitude + latDelta],
  ];
}

export function circlePolygon(center: Coordinates, radiusMeters: number, points = 64): [number, number][][] {
  const ring: [number, number][] = [];
  const angularDistance = radiusMeters / EARTH_RADIUS_METERS;
  const latitude = radians(center.latitude);
  const longitude = radians(center.longitude);
  for (let index = 0; index <= points; index += 1) {
    const bearing = 2 * Math.PI * index / points;
    const pointLatitude = Math.asin(
      Math.sin(latitude) * Math.cos(angularDistance) + Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing),
    );
    const pointLongitude = longitude + Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
      Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(pointLatitude),
    );
    ring.push([pointLongitude * 180 / Math.PI, pointLatitude * 180 / Math.PI]);
  }
  return [ring];
}

export function formatFreshness(publishedAt: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - new Date(publishedAt).getTime()) / 60_000));
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  return `${Math.floor(hours / 24)} дн назад`;
}

export class BoundedDiscoveryCache<T> {
  private readonly entries = new Map<string, { value: T; storedAt: number }>();

  constructor(private readonly maxEntries = MAP_CACHE_MAX_ENTRIES) {}

  get(key: string, now = Date.now()) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return { ...entry, ageMs: Math.max(0, now - entry.storedAt) };
  }

  set(key: string, value: T, storedAt = Date.now()) {
    this.entries.delete(key);
    this.entries.set(key, { value, storedAt });
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.entries.delete(oldestKey);
    }
  }

  clear() {
    this.entries.clear();
  }

  get size() {
    return this.entries.size;
  }
}

export class LatestRequestGuard {
  private sequence = 0;

  begin() {
    this.sequence += 1;
    return this.sequence;
  }

  isLatest(sequence: number) {
    return sequence === this.sequence;
  }

  invalidate() {
    this.sequence += 1;
  }
}

export function parsePersistedMapState(value: string | null): PersistedMapState | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PersistedMapState>;
    const radius = parsed.search?.radius;
    const mode = parsed.search?.mode;
    const anchor = parsed.search?.anchor;
    const camera = parsed.camera;
    if (![500, 1000, 3000].includes(Number(radius)) || !["near_me", "map_area"].includes(String(mode))) return null;
    if (!anchor || !camera?.center || !Number.isFinite(anchor.latitude) || !Number.isFinite(anchor.longitude) || !Number.isFinite(camera.center.latitude) || !Number.isFinite(camera.center.longitude) || !Number.isFinite(camera.zoom)) return null;
    return {
      search: { anchor, radius: radius as SearchState["radius"], mode: mode as SearchMode },
      camera,
      filter: typeof parsed.filter === "string" ? parsed.filter : "all",
      showTasks: parsed.showTasks !== false,
      showExecutors: parsed.showExecutors !== false,
      selectedTaskId: typeof parsed.selectedTaskId === "string" ? parsed.selectedTaskId : null,
      scrollY: Number.isFinite(parsed.scrollY) ? Math.max(0, Number(parsed.scrollY)) : 0,
    };
  } catch {
    return null;
  }
}
