"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ListTodo, Map, UserRound } from "lucide-react";

const items = [
  { href: "/", label: "Карта", icon: Map, active: (pathname: string) => pathname === "/" },
  { href: "/my-tasks", label: "Мои задачи", icon: ListTodo, active: (pathname: string) => pathname.startsWith("/my-tasks") || pathname.startsWith("/tasks") },
  { href: "/profile", label: "Профиль", icon: UserRound, active: (pathname: string) => pathname.startsWith("/profile") || pathname.startsWith("/wallet") || pathname.startsWith("/users/") },
] as const;

export function BottomNavigation() {
  const pathname = usePathname();
  if (pathname.startsWith("/login") || pathname.startsWith("/test-login")) return null;

  return <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200/80 bg-white/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_30px_rgba(28,25,23,0.08)] backdrop-blur-xl dark:border-stone-800 dark:bg-stone-950/95" aria-label="Основная навигация">
    <div className="mx-auto grid max-w-md grid-cols-3 px-3">
      {items.map((item) => {
        const Icon = item.icon;
        const selected = item.active(pathname);
        return <Link key={item.href} href={item.href} aria-current={selected ? "page" : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-bold transition ${selected ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" : "text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-900"}`}><Icon className={`size-5 ${selected ? "stroke-[2.6]" : ""}`} /><span>{item.label}</span></Link>;
      })}
    </div>
  </nav>;
}
