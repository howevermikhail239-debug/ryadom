"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PhoneLogin({ nextPath = "/", enabled }: { nextPath?: string; enabled: boolean }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retryAfter, setRetryAfter] = useState(0);

  useEffect(() => {
    if (retryAfter <= 0) return;
    const timer = window.setInterval(() => setRetryAfter((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [retryAfter]);

  async function requestCode() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/phone/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const result = await response.json() as { ok?: boolean; error?: string; retryAfterSeconds?: number; debugCode?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Не удалось отправить код.");
      setStep("code");
      setRetryAfter(result.retryAfterSeconds ?? 60);
      if (result.debugCode) setCode(result.debugCode);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось отправить код.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/phone/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Не удалось войти.");
      window.location.assign(nextPath.startsWith("/") ? nextPath : "/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось войти.");
      setBusy(false);
    }
  }

  if (!enabled) {
    return <p className="rounded-2xl bg-stone-100 p-3 text-center text-xs text-stone-600 dark:bg-stone-800 dark:text-stone-300">Вход по телефону подготовлен. Для отправки кодов подключите SMS.ru.</p>;
  }

  return (
    <form className="space-y-3" onSubmit={step === "phone" ? (event) => { event.preventDefault(); void requestCode(); } : verifyCode}>
      <label className="block space-y-2">
        <span className="text-sm font-semibold">Номер телефона</span>
        <Input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" autoComplete="tel" placeholder="+7 999 123-45-67" disabled={step === "code" || busy} required />
      </label>
      {step === "code" && (
        <label className="block space-y-2">
          <span className="text-sm font-semibold">Код из SMS</span>
          <Input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" minLength={6} maxLength={6} required autoFocus />
        </label>
      )}
      {error && <p role="alert" className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy || (step === "code" && code.length !== 6)}>
        {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Phone className="size-4" />}
        {step === "phone" ? "Получить код" : "Войти по коду"}
      </Button>
      {step === "code" && <button type="button" className="w-full text-xs font-semibold text-stone-500 disabled:opacity-50" disabled={busy || retryAfter > 0} onClick={() => void requestCode()}>{retryAfter > 0 ? `Новый код через ${retryAfter} сек.` : "Отправить код ещё раз"}</button>}
    </form>
  );
}
