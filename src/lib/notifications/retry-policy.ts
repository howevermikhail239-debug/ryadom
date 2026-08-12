export const MAX_NOTIFICATION_DELIVERY_ATTEMPTS = 6;

export function notificationRetryDecision({
  attempt,
  retryable,
  retryAfterSeconds,
  now = new Date(),
}: {
  attempt: number;
  retryable: boolean;
  retryAfterSeconds?: number;
  now?: Date;
}) {
  const terminal = !retryable || attempt >= MAX_NOTIFICATION_DELIVERY_ATTEMPTS;
  if (terminal) return { terminal: true as const, nextAttemptAt: null };
  const delayMs = retryAfterSeconds
    ? Math.min(retryAfterSeconds * 1000, 60 * 60_000)
    : Math.min(30_000 * 2 ** Math.max(0, attempt - 1), 30 * 60_000);
  return { terminal: false as const, nextAttemptAt: new Date(now.getTime() + delayMs) };
}
