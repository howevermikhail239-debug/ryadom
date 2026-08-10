"use client";

import { useState, useTransition } from "react";
import { Banknote, ClipboardPlus, LoaderCircle, MapPinned } from "lucide-react";

import { completeOnboardingAction } from "@/app/actions/account";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

const steps = [
  { icon: ClipboardPlus, title: "Вы заказчик", text: "Создавайте задачи в один клик и находите помощь рядом." },
  { icon: MapPinned, title: "Вы исполнитель", text: "Берите подходящие задачи рядом с домом и зарабатывайте." },
  { icon: Banknote, title: "Безопасная сделка", text: "При онлайн-оплате деньги замораживаются на время работы." },
];

export function OnboardingModal({ shouldOpen }: { shouldOpen: boolean }) {
  const [open, setOpen] = useState(shouldOpen);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function finish() {
    setError("");
    startTransition(async () => {
      try {
        const result = await completeOnboardingAction();
        if (result.ok) setOpen(false);
      } catch {
        setError("Не удалось сохранить результат. Проверьте соединение и повторите.");
      }
    });
  }

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogContent className="sm:max-w-lg">
      <DialogTitle>Добро пожаловать в «Рядом»</DialogTitle>
      <DialogDescription>Небольшие дела и подработка в вашем районе — без долгих переписок.</DialogDescription>
      <div className="mt-5 space-y-3">
        {steps.map(({ icon: Icon, title, text }, index) => <div key={title} className="flex gap-4 rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"><Icon className="size-5" /></span><div><p className="text-xs font-black uppercase tracking-wider text-emerald-700">Шаг {index + 1}</p><h3 className="font-black">{title}</h3><p className="mt-1 text-sm leading-5 text-stone-500">{text}</p></div></div>)}
      </div>
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <Button type="button" size="lg" className="mt-5 w-full" onClick={finish} disabled={pending}>{pending ? <LoaderCircle className="size-5 animate-spin" /> : null}{pending ? "Сохраняем…" : "Понятно, начать"}</Button>
    </DialogContent>
  </Dialog>;
}
