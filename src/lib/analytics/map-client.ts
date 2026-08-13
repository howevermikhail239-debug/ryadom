"use client";

type MapEventName = "map_opened" | "map_search_here" | "map_return_to_me" | "map_radius_changed" | "map_task_marker_opened" | "map_task_opened" | "map_cluster_opened" | "map_executor_layer_toggled" | "map_executor_marker_opened";

export function trackMapEvent(name: MapEventName, input: { taskId?: string; properties?: Record<string, string | number | boolean | null> } = {}) {
  void fetch("/api/analytics/map", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, ...input }),
    keepalive: true,
  }).catch(() => undefined);
}
