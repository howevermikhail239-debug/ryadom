"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { telegramImpactMedium, telegramNotification } from "@/lib/telegram/haptics";

export function FastMatchButton({
  taskId,
  authenticated,
  disabled,
  cooldownUntil,
}: {
  taskId: string;
  authenticated: boolean;
  disabled?: boolean;
  cooldownUntil?: string | null;
}) {
  const router = useRouter();
  const idempotencyKey = useRef<string>(crypto.randomUUID());
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!cooldownUntil || new Date(cooldownUntil).getTime() <= now) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [cooldownUntil, now]);
  const cooldownSeconds = cooldownUntil ? Math.max(0, Math.ceil((new Date(cooldownUntil).getTime() - now) / 1000)) : 0;

  if (cooldownSeconds > 0) {
    return <div className="rounded-2xl bg-orange-100 p-4 text-center text-sm font-bold text-orange-900"><p>Вы отменили прошлую задачу. Поиск временно недоступен.</p><p className="mt-1 text-lg tabular-nums">{String(Math.floor(cooldownSeconds / 60)).padStart(2, "0")}:{String(cooldownSeconds % 60).padStart(2, "0")}</p></div>;
  }

  async function accept() {
    telegramImpactMedium();
    if (!authenticated) {
      router.push(`/login?next=${encodeURIComponent(`/tasks/${taskId}`)}`);
      return;
    }
    setState("loading");
    setError("");
    try {
      const response = await fetch(`/api/tasks/${taskId}/accept`, {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey.current },
      });
      const result = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Не удалось взять задачу.");
      setState("success");
      telegramNotification("success");
      window.setTimeout(() => router.refresh(), 700);
    } catch (cause) {
      setState("error");
      telegramNotification("error");
      setError(cause instanceof Error ? cause.message : "Не удалось взять задачу.");
    }
  }

  return (
    <div className="space-y-3">
      <Button type="button" size="lg" className="w-full text-lg" disabled={disabled || state === "loading" || state === "success"} onClick={accept}>
        {state === "loading" ? <LoaderCircle className="size-5 animate-spin" /> : state === "success" ? <CheckCircle2 className="size-5" /> : <Zap className="size-5 fill-current" />}
        {state === "loading" ? "Закрепляем за вами…" : state === "success" ? "Задача ваша" : "Взять задачу"}
      </Button>
      {state === "error" && <p role="alert" className="rounded-2xl bg-red-50 p-3 text-center text-sm text-red-700">{error}</p>}
      {!disabled && <p className="text-center text-xs leading-5 text-stone-500">Один тап — и заказчик сразу получит уведомление. Без переписки.</p>}
    </div>
  );
}
