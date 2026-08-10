"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const ATTEMPT_KEY = "ryadom:telegram-auto-auth";

export function TelegramAutoAuth() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/login" || sessionStorage.getItem(ATTEMPT_KEY) === "done") return;

    let cancelled = false;
    let attempts = 0;
    const timer = window.setInterval(async () => {
      attempts += 1;
      const initData = window.Telegram?.WebApp?.initData;
      if (!initData && attempts < 30) return;
      window.clearInterval(timer);
      if (!initData || cancelled) return;

      sessionStorage.setItem(ATTEMPT_KEY, "done");
      try {
        window.Telegram?.WebApp?.ready();
        window.Telegram?.WebApp?.expand();
        const response = await fetch("/api/auth/telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ kind: "webapp", initData }),
        });
        if (!response.ok) {
          sessionStorage.removeItem(ATTEMPT_KEY);
          return;
        }
        if (!cancelled) window.location.reload();
      } catch {
        sessionStorage.removeItem(ATTEMPT_KEY);
      }
    }, 100);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pathname]);

  return null;
}
