"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, LogIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type TestUser = { id: string; displayName: string; roles: string[] };

export function TestLoginForm({ users }: { users: TestUser[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: form.get("userId"), accessCode: form.get("accessCode") }),
      });
      const result = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Не удалось войти.");
      router.push("/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось войти.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="block space-y-2">
        <span className="text-sm font-semibold">Тестовый профиль</span>
        <select name="userId" required className="h-12 w-full rounded-2xl border border-stone-200 bg-white px-4 dark:border-stone-700 dark:bg-stone-900">
          {users.map((user) => (
            <option key={user.id} value={user.id}>{user.displayName} — {user.roles.join(", ")}</option>
          ))}
        </select>
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-semibold">Пароль</span>
        <Input name="accessCode" type="password" required minLength={6} autoComplete="off" placeholder="Введите пароль пользователя" />
      </label>
      {error && <p role="alert" className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading || users.length === 0}>
        {loading ? <LoaderCircle className="size-4 animate-spin" /> : <LogIn className="size-4" />}
        Войти под тестовым пользователем
      </Button>
    </form>
  );
}
