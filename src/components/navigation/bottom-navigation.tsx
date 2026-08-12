"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ListTodo, Map, UserRound } from "lucide-react";

const items = [
  { href: "/", label: "Карта", icon: Map, active: (pathname: string) => pathname === "/" },
  { href: "/my-tasks", label: "Мои задачи", icon: ListTodo, active: (pathname: string) => pathname.startsWith("/my-tasks") || pathname.startsWith("/tasks") },
  { href: "/notifications", label: "События", icon: Bell, active: (pathname: string) => pathname.startsWith("/notifications") },
  { href: "/profile", label: "Профиль", icon: UserRound, active: (pathname: string) => pathname.startsWith("/profile") || pathname.startsWith("/wallet") || pathname.startsWith("/users/") },
] as const;

export function BottomNavigation({ unreadCount = 0 }: { unreadCount?: number }) {
  const pathname = usePathname();
  if (pathname.startsWith("/login") || pathname.startsWith("/test-login")) return null;

  return <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200/80 bg-white/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_30px_rgba(28,25,23,0.08)] backdrop-blur-xl dark:border-stone-700/80 dark:bg-[#151c18]/95 dark:shadow-[0_-8px_30px_rgba(0,0,0,0.28)]" aria-label="Основная навигация">
    <div className="mx-auto grid max-w-md grid-cols-4 px-2">
      {items.map((item) => {
        const Icon = item.icon;
        const selected = item.active(pathname);
        const badge = item.href === "/notifications" && unreadCount > 0;
        return <Link key={item.href} href={item.href} aria-current={selected ? "page" : undefined} className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-bold transition ${selected ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-900/45 dark:text-emerald-100" : "text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"}`}><span className="relative"><Icon className={`size-5 ${selected ? "stroke-[2.6]" : ""}`} />{badge && <span className="absolute -right-3 -top-2 grid min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-[10px] leading-5 text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}</span><span>{item.label}</span></Link>;
      })}
    </div>
  </nav>;
}
