import "server-only";

export type ProductEventName =
  | "task_created"
  | "task_viewed"
  | "task_accepted"
  | "fast_match_success"
  | "fast_match_conflict"
  | "repeat_task"
  | "favorite_performer_added"
  | "message_sent"
  | "completion_submitted"
  | "completion_confirmed"
  | "notification_sent"
  | "notification_opened";

type EventProperties = Record<string, boolean | number | string | null | undefined>;

export function trackProductEvent({
  name,
  userId,
  taskId,
  properties,
}: {
  name: ProductEventName;
  userId?: string | null;
  taskId?: string | null;
  properties?: EventProperties;
}) {
  console.info(JSON.stringify({
    kind: "product_event",
    name,
    occurredAt: new Date().toISOString(),
    userId: userId ?? null,
    taskId: taskId ?? null,
    properties: properties ?? {},
  }));
}
