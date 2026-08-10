"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";

export function ProfileActions() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  async function logout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    sessionStorage.removeItem("ryadom:telegram-auto-auth");
    router.replace("/login");
    router.refresh();
  }
  return <div className="flex items-center gap-2"><ThemeToggle /><Button type="button" variant="outline" className="min-h-11 rounded-2xl" onClick={logout} disabled={loggingOut}><LogOut className="size-4" /> {loggingOut ? "Выходим…" : "Выйти"}</Button></div>;
}
