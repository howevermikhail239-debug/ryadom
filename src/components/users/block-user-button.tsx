"use client";

import { useState } from "react";
import { Ban, LoaderCircle, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";

export function BlockUserButton({ userId, initialBlocked = false }: { userId: string; initialBlocked?: boolean }) {
  const [blocked, setBlocked] = useState(initialBlocked);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    if (!blocked && !window.confirm("Заблокировать пользователя? Вы больше не будете видеть друг друга в подборе и чате.")) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/blocks/${userId}`, { method: blocked ? "DELETE" : "POST" });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Не удалось изменить блокировку.");
      setBlocked((value) => !value);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось изменить блокировку.");
    } finally {
      setPending(false);
    }
  }

  return <div className="mt-2"><Button type="button" variant="ghost" size="sm" onClick={() => void toggle()} disabled={pending} className={blocked ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : blocked ? <ShieldCheck className="size-4" /> : <Ban className="size-4" />}{blocked ? "Разблокировать" : "Заблокировать пользователя"}</Button>{error ? <p className="mt-1 text-xs text-red-700 dark:text-red-300" role="alert">{error}</p> : null}</div>;
}
