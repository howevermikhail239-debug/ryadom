import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { TestLoginForm } from "@/components/auth/test-login-form";
import { Card, CardContent } from "@/components/ui/card";
import { serverEnv } from "@/config/server-env";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function TestLoginPage() {
  if (!serverEnv.ENABLE_TEST_AUTH) notFound();
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login?next=/test-login");
  if (!currentUser.roles.includes("ADMIN")) notFound();
  const users = await prisma.user.findMany({
    where: { isTest: true, status: "ACTIVE", deletedAt: null },
    orderBy: { displayName: "asc" },
    select: { id: true, displayName: true, roles: true },
  });

  return (
    <main className="mx-auto grid min-h-dvh max-w-lg place-items-center px-4 py-10">
      <Card className="w-full dark:border-stone-700 dark:bg-stone-900">
        <CardContent className="space-y-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Только для тестирования</p>
            <h1 className="mt-2 text-2xl font-black">Сменить пользователя</h1>
            <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">Текущая сессия будет заменена выбранным тестовым профилем.</p>
          </div>
          <TestLoginForm users={users} />
          <Link href="/" className="block text-center text-sm font-semibold text-emerald-700">Вернуться на главную</Link>
        </CardContent>
      </Card>
    </main>
  );
}
