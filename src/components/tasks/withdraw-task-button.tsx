"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { telegramNotification } from "@/lib/telegram/haptics";

export function WithdrawTaskButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function withdraw() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/tasks/${taskId}/withdraw`, { method: "POST" });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Не удалось отказаться.");
      telegramNotification("warning");
      router.replace("/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось отказаться.");
      setLoading(false);
    }
  }
  return <div className="space-y-2">{confirming ? <div className="rounded-2xl border border-orange-200 bg-orange-50 p-3"><p className="mb-2 text-sm font-semibold text-orange-900">Задача вернётся в поиск, а новые отклики будут заблокированы на 30 минут.</p><div className="grid grid-cols-2 gap-2"><Button type="button" variant="outline" onClick={() => setConfirming(false)} disabled={loading}>Остаться</Button><Button type="button" variant="destructive" onClick={() => void withdraw()} disabled={loading}>{loading ? <LoaderCircle className="size-4 animate-spin" /> : <LogOut className="size-4" />}Отказаться</Button></div></div> : <Button type="button" variant="outline" className="w-full text-orange-700" onClick={() => setConfirming(true)}><LogOut className="size-4" />Отказаться от задачи</Button>}{error && <p role="alert" className="text-sm text-red-700">{error}</p>}</div>;
}
