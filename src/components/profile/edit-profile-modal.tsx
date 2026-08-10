"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, Pencil } from "lucide-react";

import { updateProfileAction } from "@/app/actions/account";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function EditProfileModal({ displayName, bio }: { displayName: string; bio: string | null }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError("");
    startTransition(async () => {
      const result = await updateProfileAction({ ok: false, error: "" }, formData);
      if (result.ok) setOpen(false);
      else setError(result.error);
    });
  }

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button type="button" variant="outline"><Pencil className="size-4" /> Редактировать</Button></DialogTrigger>
    <DialogContent>
      <DialogTitle>Редактировать профиль</DialogTitle>
      <DialogDescription>Эти данные будут видны заказчикам и исполнителям.</DialogDescription>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <label className="block"><span className="mb-1.5 block text-sm font-bold">Имя</span><Input name="displayName" defaultValue={displayName} minLength={2} maxLength={100} required autoComplete="name" /></label>
        <label className="block"><span className="mb-1.5 block text-sm font-bold">О себе</span><Textarea name="bio" defaultValue={bio ?? ""} maxLength={500} placeholder="Расскажите об опыте, навыках и том, чем можете помочь." /><span className="mt-1 block text-xs text-stone-500">До 500 символов. Телефон и другие личные контакты лучше не публиковать.</span></label>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <Button type="submit" className="w-full" disabled={pending}>{pending && <LoaderCircle className="size-4 animate-spin" />}{pending ? "Сохраняем…" : "Сохранить"}</Button>
      </form>
    </DialogContent>
  </Dialog>;
}
