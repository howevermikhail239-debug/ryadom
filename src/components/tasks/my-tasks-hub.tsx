"use client";

import { useMemo, useState } from "react";
import { ListChecks, RefreshCw } from "lucide-react";

import { MyTaskCard } from "@/components/tasks/my-task-card";
import { Button } from "@/components/ui/button";
import { myTaskGroup } from "@/lib/tasks/my-task-status";
import type { MyTaskGroup, MyTaskItem, MyTaskRole } from "@/types/my-task";

const groups: Array<{ value: MyTaskGroup; label: string }> = [
  { value: "active", label: "Активные" },
  { value: "completed", label: "Завершённые" },
  { value: "cancelled", label: "Отменённые" },
];

export function MyTasksHub({ initialItems, initialRole = "customer" }: { initialItems: MyTaskItem[]; initialRole?: MyTaskRole }) {
  const [items, setItems] = useState(initialItems);
  const [role, setRole] = useState<MyTaskRole>(initialRole);
  const [group, setGroup] = useState<MyTaskGroup>("active");
  const [refreshing, setRefreshing] = useState(false);

  const visible = useMemo(() => items.filter((item) => item.role === role && myTaskGroup(item) === group), [group, items, role]);
  const roleCount = (value: MyTaskRole) => items.filter((item) => item.role === value).length;
  const groupCount = (value: MyTaskGroup) => items.filter((item) => item.role === role && myTaskGroup(item) === value).length;

  async function refresh() {
    setRefreshing(true);
    try {
      const response = await fetch("/api/tasks/my", { cache: "no-store" });
      if (response.ok) {
        const payload = (await response.json()) as { items: MyTaskItem[] };
        setItems(payload.items);
      }
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div>
      <div className="grid grid-cols-2 rounded-2xl bg-stone-200/70 p-1 dark:bg-stone-800" role="tablist" aria-label="Роль в задаче">
        {(["customer", "performer"] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={role === value} onClick={() => setRole(value)} className={`min-h-12 rounded-xl px-2 text-sm font-bold transition ${role === value ? "bg-white text-stone-950 shadow-sm dark:bg-stone-950 dark:text-white" : "text-stone-600 dark:text-stone-300"}`}>{value === "customer" ? "Созданные мной" : "Взятые в работу"} <span className="text-xs opacity-60">{roleCount(value)}</span></button>)}
      </div>

      <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Фильтр по статусу">
        {groups.map((item) => <button key={item.value} type="button" aria-pressed={group === item.value} onClick={() => setGroup(item.value)} className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-bold transition ${group === item.value ? "border-emerald-700 bg-emerald-700 text-white" : "border-stone-200 bg-white text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"}`}>{item.label} <span className="opacity-70">{groupCount(item.value)}</span></button>)}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <p className="text-sm text-stone-500">{visible.length} {visible.length === 1 ? "задача" : "задач"}</p>
        <Button type="button" size="sm" variant="ghost" onClick={refresh} disabled={refreshing}><RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} /> Обновить</Button>
      </div>

      {visible.length ? <div className="mt-3 grid gap-3 md:grid-cols-2">{visible.map((task) => <MyTaskCard key={`${task.role}:${task.id}`} task={task} />)}</div> : <div className="mt-4 rounded-3xl border border-dashed border-stone-300 px-6 py-12 text-center dark:border-stone-700"><span className="mx-auto grid size-12 place-items-center rounded-full bg-stone-100 dark:bg-stone-800"><ListChecks className="size-6 text-stone-500" /></span><p className="mt-3 font-bold">Здесь пока пусто</p><p className="mt-1 text-sm text-stone-500">Задачи появятся здесь автоматически после создания или отклика.</p></div>}
    </div>
  );
}
