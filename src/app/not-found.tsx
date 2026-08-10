import Link from "next/link";
import { MapPinOff } from "lucide-react";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-5 text-center">
      <div><MapPinOff className="mx-auto mb-4 size-10 text-stone-400" /><h1 className="text-2xl font-black">Задача не найдена</h1><p className="mt-2 text-stone-500">Возможно, её удалили или ссылка устарела.</p><Link href="/" className="mt-6 inline-flex min-h-11 items-center rounded-2xl bg-emerald-950 px-5 font-bold text-white">Вернуться к карте</Link></div>
    </main>
  );
}
