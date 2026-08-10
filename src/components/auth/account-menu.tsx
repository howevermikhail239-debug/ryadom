"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, BriefcaseBusiness, ClipboardList, LogOut, ShieldCheck, UserRound, UsersRound, WalletCards } from "lucide-react";

import { Button } from "@/components/ui/button";

export function AccountMenu({ user }: { user: { displayName: string; avatarUrl: string | null; isAdmin: boolean; telegramVerified: boolean } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    sessionStorage.removeItem("ryadom:telegram-auto-auth");
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex min-h-11 items-center gap-2 rounded-full bg-white py-1.5 pl-2 pr-3 text-sm font-semibold shadow-sm dark:bg-stone-900" aria-expanded={open}>
        <span className="grid size-8 place-items-center overflow-hidden rounded-full bg-emerald-100 text-emerald-900"><UserRound className="size-4" /></span>
        <span className="max-w-28 truncate">{user.displayName}</span>
        {user.telegramVerified && <BadgeCheck className="size-4 text-sky-600" aria-label="Telegram Verified" />}
        {user.isAdmin && <ShieldCheck className="size-4 text-emerald-600" aria-label="Администратор" />}
      </button>

      {open && (
        <div className="absolute right-0 top-13 z-50 w-64 rounded-2xl border border-stone-200 bg-white p-2 shadow-xl dark:border-stone-700 dark:bg-stone-900">
          <p className="px-3 py-2 text-xs text-stone-500">{user.isAdmin ? "Администратор" : "Пользователь"}</p>
          {user.telegramVerified && <p className="flex items-center gap-1 px-3 pb-2 text-xs font-semibold text-sky-700 dark:text-sky-300"><BadgeCheck className="size-4" />Telegram Verified</p>}
          <Link href="/wallet" onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold hover:bg-stone-100 dark:hover:bg-stone-800"><WalletCards className="size-4" /> Кошелёк</Link>
          {user.isAdmin && <>
            <Link href="/my-tasks" onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold hover:bg-stone-100 dark:hover:bg-stone-800"><BriefcaseBusiness className="size-4" /> Мои задачи</Link>
            <Link href="/tasks" onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold hover:bg-stone-100 dark:hover:bg-stone-800"><ClipboardList className="size-4" /> Все задачи</Link>
            <Link href="/test-login" onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold hover:bg-stone-100 dark:hover:bg-stone-800"><UsersRound className="size-4" /> Тестовый пользователь</Link>
          </>}
          <Button type="button" variant="ghost" className="w-full justify-start" onClick={logout} disabled={loggingOut}><LogOut className="size-4" /> {loggingOut ? "Выходим…" : "Выйти"}</Button>
        </div>
      )}
    </div>
  );
}
