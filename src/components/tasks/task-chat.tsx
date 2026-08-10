"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, LoaderCircle, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { telegramNotification } from "@/lib/telegram/haptics";
import { UserAvatar } from "@/components/users/user-avatar";

type ChatMessage = { id: string; text: string | null; imageUrl: string | null; createdAt: string; isMine: boolean; senderId: string; senderName: string; senderAvatarUrl: string | null };

export function TaskChat({ taskId, canUploadProof }: { taskId: string; canUploadProof: boolean }) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    const response = await fetch(`/api/tasks/${taskId}/messages`, { cache: "no-store" });
    if (!response.ok) return;
    const result = await response.json() as { messages?: ChatMessage[] };
    setMessages(result.messages ?? []);
  }, [taskId]);

  useEffect(() => {
    const initial = window.setTimeout(() => void loadMessages(), 0);
    const timer = window.setInterval(() => void loadMessages(), 4000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [loadMessages]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  function selectImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 600_000) {
      setError("Используйте JPG, PNG или WebP размером до 600 КБ.");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImageUrl(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => setError("Не удалось прочитать изображение.");
    reader.readAsDataURL(file);
  }

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim() && !imageUrl) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch(`/api/tasks/${taskId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, imageUrl }) });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Не удалось отправить сообщение.");
      const sentProof = Boolean(imageUrl);
      setText("");
      setImageUrl(null);
      telegramNotification("success");
      await loadMessages();
      if (sentProof) router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось отправить сообщение.");
    } finally {
      setSending(false);
    }
  }

  return <section id="chat" className="rounded-3xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
    <div className="mb-3"><h2 className="font-black">Чат по задаче</h2><p className="text-xs text-stone-500">Сообщения видят только заказчик и исполнитель.</p></div>
    <div className="max-h-80 space-y-2 overflow-y-auto rounded-2xl bg-stone-50 p-3 dark:bg-stone-950">
      {messages.length === 0 && <p className="py-8 text-center text-sm text-stone-400">Напишите первое сообщение.</p>}
      {messages.map((message) => <div key={message.id} className={`max-w-[86%] rounded-2xl p-3 text-sm ${message.isMine ? "ml-auto bg-emerald-100 text-emerald-950" : "bg-white text-stone-800 shadow-sm dark:bg-stone-800 dark:text-stone-100"}`}><Link href={`/users/${message.senderId}`} className="mb-2 flex w-fit items-center gap-2 rounded-lg font-bold opacity-70 hover:opacity-100"><UserAvatar name={message.senderName} avatarUrl={message.senderAvatarUrl} className="size-7" /><span className="text-[11px]">{message.isMine ? "Вы" : message.senderName}</span></Link>{message.imageUrl && <Image src={message.imageUrl} alt="Фото по задаче" width={480} height={360} unoptimized className="mb-2 max-h-64 w-full rounded-xl object-cover" />}{message.text && <p className="whitespace-pre-wrap">{message.text}</p>}<time className="mt-1 block text-[10px] opacity-50">{new Date(message.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</time></div>)}
      <div ref={bottomRef} />
    </div>
    {imageUrl && <div className="mt-3 flex items-center gap-3 rounded-2xl bg-emerald-50 p-2"><Image src={imageUrl} alt="Предпросмотр" width={64} height={64} unoptimized className="size-16 rounded-xl object-cover" /><span className="text-xs font-semibold text-emerald-900">Фото готово к отправке</span><button type="button" onClick={() => setImageUrl(null)} className="ml-auto text-xs font-bold text-stone-500">Убрать</button></div>}
    <form onSubmit={sendMessage} className="mt-3 flex items-center gap-2">
      {canUploadProof && <label className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-800" title="Добавить фото"><ImagePlus className="size-5" /><input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectImage} className="sr-only" /></label>}
      <Input value={text} onChange={(event) => setText(event.target.value)} maxLength={1000} placeholder="Сообщение…" aria-label="Сообщение" />
      <Button type="submit" size="icon" disabled={sending || (!text.trim() && !imageUrl)} aria-label="Отправить">{sending ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}</Button>
    </form>
    {canUploadProof && <p className="mt-2 text-xs text-stone-500">Фото до 600 КБ станет подтверждением выполненной работы.</p>}
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
  </section>;
}
