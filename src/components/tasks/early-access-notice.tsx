"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function EarlyAccessNotice({ until }: { until: string }) {
  const router = useRouter();
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.ceil((new Date(until).getTime() - Date.now()) / 1000)));

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = Math.max(0, Math.ceil((new Date(until).getTime() - Date.now()) / 1000));
      setSeconds(next);
      if (next === 0) {
        window.clearInterval(timer);
        router.refresh();
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [router, until]);

  return <p className="rounded-2xl bg-amber-100 p-4 text-center text-sm font-bold text-amber-900">Пока задача доступна приглашённому исполнителю. Для всех рядом откроется через {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}.</p>;
}
