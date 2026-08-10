import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const WINDOWS_DOCKER = "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe";
const WINDOWS_DESKTOP = "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe";

export const dockerExecutable =
  process.platform === "win32" && existsSync(WINDOWS_DOCKER) ? WINDOWS_DOCKER : "docker";

export function docker(args, options = {}) {
  const result = spawnSync(dockerExecutable, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.error) throw result.error;
  return result;
}

function engineIsReady() {
  return docker(["info", "--format", "{{.ServerVersion}}"], { capture: true }).status === 0;
}

export async function ensureDockerEngine() {
  if (engineIsReady()) return;

  if (process.platform !== "win32" || !existsSync(WINDOWS_DESKTOP)) {
    throw new Error("Docker Engine не запущен. Запустите Docker и повторите команду.");
  }

  console.log("Запускаем Docker Desktop...");
  const desktop = spawn(WINDOWS_DESKTOP, [], { detached: true, stdio: "ignore" });
  desktop.unref();

  for (let attempt = 0; attempt < 60; attempt += 1) {
    await delay(2_000);
    if (engineIsReady()) return;
  }
  throw new Error("Docker Desktop не запустил Engine за 120 секунд. Откройте Docker Desktop и проверьте его состояние.");
}

export const composePrefix = ["compose", "--env-file", ".env.production"];
