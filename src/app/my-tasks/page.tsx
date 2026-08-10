import { redirect } from "next/navigation";
import { ListTodo } from "lucide-react";

import { MyTasksHub } from "@/components/tasks/my-tasks-hub";
import { getCurrentUser } from "@/lib/auth/session";
import { loadMyTasks } from "@/lib/tasks/my-tasks";
import type { MyTaskRole } from "@/types/my-task";

export const dynamic = "force-dynamic";

export default async function MyTasksPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fmy-tasks");
  const { role } = await searchParams;
  const initialRole: MyTaskRole = role === "performer" ? "performer" : "customer";
  const items = await loadMyTasks(user.id);

  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-4 pb-32 pt-5 sm:px-8">
      <header className="mb-5">
        <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400"><ListTodo className="size-4" /> Управление заказами</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight">Мои задачи</h1>
        <p className="mt-1 text-sm text-stone-500">Всё, что вы создали или взяли в работу.</p>
      </header>
      <MyTasksHub initialItems={items} initialRole={initialRole} />
    </main>
  );
}
