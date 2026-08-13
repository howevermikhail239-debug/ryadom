import assert from "node:assert/strict";
import test from "node:test";

import {
  BoundedDiscoveryCache,
  EXECUTOR_CACHE_TTL_MS,
  LatestRequestGuard,
  TASK_CACHE_TTL_MS,
  buildDiscoveryCacheKey,
  circlePolygon,
  commitMapAreaSearch,
  commitNearMeSearch,
  distanceMeters,
  formatFreshness,
  parsePersistedMapState,
  radiusBounds,
  shouldOfferSearchHere,
  type SearchState,
} from "./discovery";

const search: SearchState = { anchor: { latitude: 55.751244, longitude: 37.618423 }, radius: 1000, mode: "near_me" };

test("Search Here threshold ignores micro movement and accepts a meaningful pan", () => {
  assert.equal(shouldOfferSearchHere({ latitude: 55.7515, longitude: 37.618423 }, search), false);
  assert.equal(shouldOfferSearchHere({ latitude: 55.753, longitude: 37.618423 }, search), true);
});

test("committed search transitions preserve radius and copy their anchor", () => {
  const cameraCenter = { latitude: 55.76, longitude: 37.64 };
  const mapArea = commitMapAreaSearch(search, cameraCenter);
  assert.deepEqual(mapArea, { ...search, anchor: cameraCenter, mode: "map_area" });
  assert.notEqual(mapArea.anchor, cameraCenter);

  const userLocation = { latitude: 55.74, longitude: 37.6 };
  const nearMe = commitNearMeSearch(mapArea, userLocation);
  assert.deepEqual(nearMe, { ...mapArea, anchor: userLocation, mode: "near_me" });
  assert.equal(nearMe.radius, search.radius);
  assert.notEqual(nearMe.anchor, userLocation);
});

test("task and executor caches use separate bounded refresh windows", () => {
  assert.equal(TASK_CACHE_TTL_MS, 20_000);
  assert.equal(EXECUTOR_CACHE_TTL_MS, 45_000);
  assert.ok(EXECUTOR_CACHE_TTL_MS > TASK_CACHE_TTL_MS);
});

test("radius bounds and polygon represent the requested geographic distance", () => {
  const bounds = radiusBounds(search.anchor, 1000);
  const north = { latitude: bounds[1][1], longitude: search.anchor.longitude };
  assert.ok(Math.abs(distanceMeters(search.anchor, north) - 1000) < 10);
  const polygon = circlePolygon(search.anchor, 1000);
  assert.equal(polygon[0].length, 65);
  assert.ok(Math.abs(distanceMeters(search.anchor, { longitude: polygon[0][0][0], latitude: polygon[0][0][1] }) - 1000) < 2);
});

test("cache key depends on committed anchor and radius, not camera state", () => {
  assert.equal(buildDiscoveryCacheKey(search), "55.75124:37.61842:1000");
  assert.notEqual(buildDiscoveryCacheKey({ ...search, radius: 3000 }), buildDiscoveryCacheKey(search));
});

test("bounded cache is LRU-like and exposes age for stale-while-revalidate", () => {
  const cache = new BoundedDiscoveryCache<number>(2);
  cache.set("a", 1, 100);
  cache.set("b", 2, 200);
  assert.equal(cache.get("a", 250)?.ageMs, 150);
  cache.set("c", 3, 300);
  assert.equal(cache.get("b"), null);
  assert.equal(cache.get("a")?.value, 1);
  assert.equal(cache.size, 2);
});

test("latest request guard rejects a late response from an older request", () => {
  const guard = new LatestRequestGuard();
  const requestA = guard.begin();
  const requestB = guard.begin();
  assert.equal(guard.isLatest(requestB), true);
  assert.equal(guard.isLatest(requestA), false);
});

test("freshness formatter and persisted layer state are stable", () => {
  const now = Date.parse("2026-08-12T12:00:00Z");
  assert.equal(formatFreshness("2026-08-12T11:42:00Z", now), "18 мин назад");
  const persisted = parsePersistedMapState(JSON.stringify({ search, camera: { center: search.anchor, zoom: 14 }, filter: "urgent", showTasks: true, showExecutors: false, selectedTaskId: "task", scrollY: 321 }));
  assert.equal(persisted?.showExecutors, false);
  assert.equal(persisted?.scrollY, 321);
  assert.equal(parsePersistedMapState("bad json"), null);
});
