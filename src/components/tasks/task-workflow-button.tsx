"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, CheckCheck, LoaderCircle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { telegramNotification } from "@/lib/telegram/haptics";

type Action = "complete" | "confirm-completion" | "request-changes";

const content = {
  complete: { idle: "Работа выполнена", loading: "Отправляем заказчику…", success: "Ждём подтверждения", icon: BadgeCheck },
  "confirm-completion": { idle: "Подтвердить выполнение", loading: "Подтверждаем…", success: "Задача завершена", icon: CheckCheck },
  "request-changes": { idle: "Нужна доработка", loading: "Отправляем…", success: "Отправлено исполнителю", icon: RotateCcw },
} satisfies Record<Action, { idle: string; loading: string; success: string; icon: typeof BadgeCheck }>;

export function TaskWorkflowButton({ taskId, action, secondary = false, disabledReason }: { taskId: string; action: Action; secondary?: boolean; disabledReason?: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const labels = content[action];
  const Icon = labels.icon;

  async function submit() {
    setState("loading");
    setError("");
    try {
      const response = await fetch(`/api/tasks/${taskId}/${action}`, { method: "POST" });
      const result = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Не удалось изменить статус задачи.");
      setState("success");
      telegramNotification("success");
      window.setTimeout(() => action === "confirm-completion" ? router.push(`/tasks/${taskId}?review=1`) : router.refresh(), 500);
    } catch (cause) {
      setState("error");
      telegramNotification("error");
      setError(cause instanceof Error ? cause.message : "Не удалось изменить статус задачи.");
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" size="lg" variant={secondary ? "outline" : "default"} className="w-full text-base" onClick={submit} disabled={Boolean(disabledReason) || state === "loading" || state === "success"}>
        {state === "loading" ? <LoaderCircle className="size-5 animate-spin" /> : <Icon className="size-5" />}
        {state === "loading" ? labels.loading : state === "success" ? labels.success : labels.idle}
      </Button>
      {state === "error" && <p role="alert" className="rounded-2xl bg-red-50 p-3 text-center text-sm text-red-700">{error}</p>}
      {disabledReason && <p className="rounded-2xl bg-amber-50 p-3 text-center text-xs font-semibold text-amber-800">{disabledReason}</p>}
      {action === "complete" && state === "idle" && <p className="text-center text-xs text-stone-500">Заказчик получит уведомление и подтвердит результат.</p>}
    </div>
  );
}
