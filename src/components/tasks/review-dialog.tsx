"use client";

import { useState } from "react";
import { MessageCircleHeart } from "lucide-react";

import { ReviewForm } from "@/components/tasks/review-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function ReviewDialog({ taskId, initiallyOpen = false, allowTip = false }: { taskId: string; initiallyOpen?: boolean; allowTip?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button type="button" className="mt-4 w-full"><MessageCircleHeart className="size-4" />Оставить быстрый отзыв</Button></DialogTrigger>
    <DialogContent>
      <DialogTitle>Как всё прошло?</DialogTitle>
      <DialogDescription>Выберите впечатление и при желании добавьте детали. Текст необязателен.</DialogDescription>
      <div className="mt-5"><ReviewForm taskId={taskId} allowTip={allowTip} /></div>
    </DialogContent>
  </Dialog>;
}
