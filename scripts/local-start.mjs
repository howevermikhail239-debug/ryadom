import { existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { config } from "dotenv";

import { composePrefix, docker, ensureDockerEngine } from "./local-docker.mjs";

async function main() {
  if (!existsSync(".env.production")) {
    throw new Error("Не найден .env.production. Скопируйте .env.production.example и заполните значения.");
  }

  config({ path: ".env.production", quiet: true });
  const missingIntegrations = [];
  if (!process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY || process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY.includes("placeholder")) {
    missingIntegrations.push("Яндекс Карты: NEXT_PUBLIC_YANDEX_MAPS_API_KEY");
  }
  if (!process.env.YANDEX_GEOCODER_API_KEY || process.env.YANDEX_GEOCODER_API_KEY.includes("placeholder")) {
    missingIntegrations.push("Яндекс Геокодер: YANDEX_GEOCODER_API_KEY");
  }
  if (
    !process.env.TELEGRAM_BOT_TOKEN ||
    process.env.TELEGRAM_BOT_TOKEN.includes("placeholder") ||
    !process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ||
    process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME.startsWith("local_")
  ) {
    missingIntegrations.push("Telegram: TELEGRAM_BOT_TOKEN и NEXT_PUBLIC_TELEGRAM_BOT_USERNAME");
  }

  await ensureDockerEngine();
  let started = false;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const up = docker([...composePrefix, "up", "--build", "-d"]);
    if (up.status === 0) {
      started = true;
      break;
    }
    if (attempt < 3) {
      console.log(`Сборка не завершилась (попытка ${attempt}/3). Повторяем через 5 секунд...`);
      await delay(5_000);
    }
  }
  if (!started) throw new Error("Docker Compose не смог собрать решение после трёх попыток.");

  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch("http://localhost:3000/api/health", { signal: AbortSignal.timeout(3_000) });
      if (response.ok) {
        console.log("\nРядом запущен: http://localhost:3000");
        console.log("Health check: http://localhost:3000/api/health");
        if (missingIntegrations.length > 0) {
          console.warn("\nВнешние интеграции требуют настройки:");
          for (const integration of missingIntegrations) console.warn(`- ${integration}`);
          console.warn("После заполнения .env.production снова выполните npm start.");
        }
        return;
      }
    } catch {
      // Container health check is still starting.
    }
    await delay(2_000);
  }

  docker([...composePrefix, "ps"]);
  docker([...composePrefix, "logs", "--tail=100", "app"]);
  throw new Error("Приложение не стало healthy за 80 секунд. Логи напечатаны выше.");
}

main().catch((error) => {
  console.error(`\nОшибка локального запуска: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
