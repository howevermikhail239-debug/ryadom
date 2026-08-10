"use client";

import { useEffect, useState } from "react";

function labelFor(date: string | null): string {
  if (!date) return "Можно начать сейчас";
  const diff = new Date(date).getTime() - Date.now();
  if (diff <= 0) return "Можно начать сейчас";
  const minutes = Math.ceil(diff / 60_000);
  if (minutes < 60) return `Через ${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `Через ${hours} ч${rest ? ` ${rest} мин` : ""}`;
}

export function TimeUntil({ startsAt }: { startsAt: string | null }) {
  const [label, setLabel] = useState(() => labelFor(startsAt));

  useEffect(() => {
    const update = () => setLabel(labelFor(startsAt));
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, [startsAt]);

  return <span>{label}</span>;
}
