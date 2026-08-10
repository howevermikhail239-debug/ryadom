"use client";

import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";

function applyTheme(theme: "light" | "dark") {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
  localStorage.setItem("ryadom-theme", theme);
}

export function ThemeToggle() {
  function toggle() {
    const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
    applyTheme(next);
  }

  return (
    <Button type="button" size="icon" variant="outline" onClick={toggle} aria-label="Переключить тему" title="Светлая или тёмная тема">
      <Moon className="size-5 dark:hidden" />
      <Sun className="hidden size-5 dark:block" />
    </Button>
  );
}
