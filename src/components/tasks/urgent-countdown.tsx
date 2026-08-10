"use client";

import { useEffect, useState } from "react";

function formatRemaining(expiresAt: string, now: number) {
  const seconds = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function UrgentCountdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <span className="urgent-countdown" aria-label="Осталось времени"><span aria-hidden>⚡</span> Срочно · <span suppressHydrationWarning>{formatRemaining(expiresAt, now)}</span></span>;
}
