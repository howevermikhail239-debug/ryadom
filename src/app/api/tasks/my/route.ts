import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth/session";
import { filterMyTasks, loadMyTasks } from "@/lib/tasks/my-tasks";

const querySchema = z.object({ role: z.enum(["customer", "performer"]).optional(), group: z.enum(["active", "completed", "cancelled"]).optional() });

export async function GET(request: NextRequest) {
  try {
    const user = await requireCurrentUser();
    const query = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const items = filterMyTasks(await loadMyTasks(user.id), query.role, query.group);
    return NextResponse.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ error: status === 401 ? "Войдите, чтобы открыть свои задачи." : "Не удалось загрузить задачи." }, { status });
  }
}
