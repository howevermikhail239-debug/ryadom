"use client";

import { useState } from "react";
import { Flag, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

const REASONS = [
  ["SPAM", "Спам"],
  ["FRAUD", "Мошенничество"],
  ["PROHIBITED", "Запрещённая задача"],
  ["ABUSE", "Оскорбления"],
  ["OTHER", "Другое"],
] as const;

export function ReportDialog({ taskId, reportedUserId }: { taskId?: string; reportedUserId?: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number][0]>("SPAM");
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSending(true);
    setMessage("");
    try {
      const response = await fetch("/api/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: taskId ?? null, reportedUserId: reportedUserId ?? null, reason, details: details || null }) });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Не удалось отправить жалобу.");
      setMessage("Жалоба отправлена");
      window.setTimeout(() => setOpen(false), 700);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось отправить жалобу.");
    } finally {
      setSending(false);
    }
  }

  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button type="button" variant="ghost" size="sm" className="text-stone-500"><Flag className="size-4" /> Пожаловаться</Button></DialogTrigger><DialogContent><DialogTitle>Отправить жалобу</DialogTitle><DialogDescription>Мы сохраним сигнал для ручной проверки. Автор жалобы не показывается другому пользователю.</DialogDescription><form onSubmit={submit} className="mt-5 space-y-4"><label className="block space-y-2"><span className="text-sm font-bold">Причина</span><select value={reason} onChange={(event) => setReason(event.target.value as typeof reason)} className="min-h-11 w-full rounded-xl border border-stone-200 bg-white px-3 dark:border-stone-700 dark:bg-stone-900">{REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="block space-y-2"><span className="text-sm font-bold">Комментарий <span className="font-normal text-stone-400">необязательно</span></span><Textarea value={details} onChange={(event) => setDetails(event.target.value)} maxLength={1000} placeholder="Что произошло?" /></label>{message && <p className="text-sm font-semibold text-stone-600" role="status">{message}</p>}<Button type="submit" className="w-full" disabled={sending}>{sending && <LoaderCircle className="size-4 animate-spin" />}Отправить</Button></form></DialogContent></Dialog>;
}
