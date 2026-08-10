"use client";

import { Send } from "lucide-react";

import { telegramImpactMedium } from "@/lib/telegram/haptics";

export function TelegramShareButton({ shareUrl }: { shareUrl: string }) {
  function share() {
    telegramImpactMedium();
    const webApp = window.Telegram?.WebApp;
    if (webApp?.openTelegramLink) {
      webApp.openTelegramLink(shareUrl);
      return;
    }
    window.open(shareUrl, "_blank", "noopener,noreferrer");
  }

  return <button type="button" onClick={share} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-sky-500 px-4 text-sm font-bold text-white transition hover:bg-sky-400"><Send className="size-4" />Поделиться в Telegram</button>;
}
