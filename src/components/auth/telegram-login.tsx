"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        ready(): void;
        expand(): void;
        openTelegramLink?(url: string): void;
        isVersionAtLeast(version: string): boolean;
        LocationManager?: {
          isInited: boolean;
          isLocationAvailable: boolean;
          isAccessRequested: boolean;
          isAccessGranted: boolean;
          init(callback?: () => void): void;
          getLocation(callback: (location: {
            latitude: number;
            longitude: number;
            horizontal_accuracy?: number | null;
          } | null) => void): void;
          openSettings(): void;
        };
        HapticFeedback?: {
          impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
          notificationOccurred(type: "error" | "success" | "warning"): void;
          selectionChanged(): void;
        };
      };
    };
  }
}

export function TelegramLogin({ botUsername, nextPath = "/" }: { botUsername: string; nextPath?: string }) {
  const widgetRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

  const authenticateWebApp = useCallback(async () => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp?.initData) return;
    webApp.ready();
    webApp.expand();
    setState("loading");
    setError("");
    try {
      const response = await fetch("/api/auth/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ kind: "webapp", initData: webApp.initData }),
      });
      const result = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Не удалось войти.");
      window.location.assign(nextPath.startsWith("/") ? nextPath : "/");
    } catch (cause) {
      setState("error");
      setError(cause instanceof Error ? cause.message : "Не удалось войти.");
    }
  }, [nextPath]);

  useEffect(() => {
    const initialWebAppTimer = window.setTimeout(() => void authenticateWebApp(), 0);
    const webAppTimer = window.setTimeout(() => void authenticateWebApp(), 500);

    const widgetScript = document.createElement("script");
    widgetScript.src = "https://telegram.org/js/telegram-widget.js?22";
    widgetScript.async = true;
    widgetScript.setAttribute("data-telegram-login", botUsername);
    widgetScript.setAttribute("data-size", "large");
    widgetScript.setAttribute("data-radius", "14");
    widgetScript.setAttribute("data-lang", "ru");
    widgetScript.setAttribute("data-request-access", "write");
    const callbackUrl = new URL("/api/auth/telegram/callback", window.location.origin);
    if (nextPath !== "/") callbackUrl.searchParams.set("next", nextPath);
    widgetScript.setAttribute("data-auth-url", callbackUrl.toString());
    widgetRef.current?.appendChild(widgetScript);

    return () => {
      window.clearTimeout(webAppTimer);
      window.clearTimeout(initialWebAppTimer);
      widgetScript.remove();
    };
  }, [authenticateWebApp, botUsername, nextPath]);

  return (
    <div className="space-y-4">
      <div ref={widgetRef} className="flex min-h-12 justify-center" aria-label="Вход через Telegram" />
      {state === "loading" && <div className="flex items-center justify-center gap-2 text-sm text-stone-600"><LoaderCircle className="size-4 animate-spin" /> Проверяем Telegram…</div>}
      {state === "error" && <p role="alert" className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <p className="text-center text-xs leading-5 text-stone-500">После подтверждения Telegram автоматически вернёт вас на сайт.</p>
    </div>
  );
}
