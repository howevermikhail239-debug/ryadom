const intervalMs = Math.max(15_000, Number(process.env.JOB_INTERVAL_MS ?? 30_000));
const endpoint = process.env.INTERNAL_JOB_URL ?? "http://app:3000/api/internal/jobs";
const secret = process.env.INTERNAL_JOB_SECRET;
let stopping = false;
let timer;
let activeRun = Promise.resolve();

if (!secret || secret.length < 32) {
  throw new Error("INTERNAL_JOB_SECRET длиной не менее 32 символов обязателен для job runner");
}

async function runJobs() {
  const startedAt = Date.now();
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) throw new Error(`job endpoint returned ${response.status}`);
    const result = await response.json();
    console.log(JSON.stringify({ kind: "worker_run", status: "ok", occurredAt: new Date().toISOString(), durationMs: Date.now() - startedAt, tasksClaimed: result.tasksClaimed ?? 0, notificationsQueued: result.notificationsQueued ?? 0, expired: result.expired ?? 0, notificationsClaimed: result.notificationsClaimed ?? 0 }));
  } catch (error) {
    console.error(JSON.stringify({ kind: "worker_run", status: "error", occurredAt: new Date().toISOString(), durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) }));
  }
}

async function loop() {
  if (stopping) return;
  activeRun = runJobs();
  await activeRun;
  if (!stopping) timer = setTimeout(loop, intervalMs);
}

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  if (timer) clearTimeout(timer);
  console.log(JSON.stringify({ kind: "worker_lifecycle", status: "stopping", signal, occurredAt: new Date().toISOString() }));
  await Promise.race([activeRun, new Promise((resolve) => setTimeout(resolve, 10_000))]);
  process.exit(0);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
console.log(JSON.stringify({ kind: "worker_lifecycle", status: "started", occurredAt: new Date().toISOString(), intervalMs }));
await loop();
