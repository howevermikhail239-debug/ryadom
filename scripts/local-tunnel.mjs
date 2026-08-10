import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const WINDOWS_NGROK = join(
  homedir(),
  "AppData",
  "Local",
  "Microsoft",
  "WinGet",
  "Packages",
  "Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe",
  "ngrok.exe",
);
const ngrok = process.platform === "win32" && existsSync(WINDOWS_NGROK) ? WINDOWS_NGROK : "ngrok";

async function main() {
  const health = await fetch("http://localhost:3000/api/health", { signal: AbortSignal.timeout(5_000) }).catch(() => null);
  if (!health?.ok) throw new Error("Сначала запустите приложение командой npm start.");

  const configCheck = spawnSync(ngrok, ["config", "check"], { encoding: "utf8", stdio: "pipe" });
  if (configCheck.status !== 0) {
    throw new Error(
      "ngrok не авторизован. Выполните локально: ngrok config add-authtoken ВАШ_NGROK_TOKEN",
    );
  }

  const child = spawn(ngrok, ["http", "3000", "--log", "stdout", "--log-format", "logfmt"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));

  const stop = () => {
    if (!child.killed) child.kill("SIGTERM");
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  for (let attempt = 0; attempt < 40; attempt += 1) {
    await delay(500);
    try {
      const response = await fetch("http://127.0.0.1:4040/api/tunnels", { signal: AbortSignal.timeout(1_000) });
      const payload = await response.json();
      const publicUrl = payload.tunnels?.find((tunnel) => tunnel.proto === "https")?.public_url;
      if (publicUrl) {
        console.log(`\nПубличный HTTPS URL: ${publicUrl}`);
        console.log("Оставьте этот терминал открытым. Для остановки нажмите Ctrl+C.");
        console.log("Привяжите URL в BotFather: /setdomain и Configure Mini App.");
        await new Promise((resolve) => child.once("exit", resolve));
        return;
      }
    } catch {
      // ngrok local API is still starting.
    }
  }

  stop();
  throw new Error("ngrok не создал tunnel за 20 секунд.");
}

main().catch((error) => {
  console.error(`Ошибка tunnel: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
