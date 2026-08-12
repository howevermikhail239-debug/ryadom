"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

const inputSchema = z.object({ id: z.string().uuid(), status: z.enum(["REVIEWED", "CLOSED"]) });

export async function updateReportStatus(id: string, status: "REVIEWED" | "CLOSED") {
  const user = await getCurrentUser();
  if (!user?.roles.includes("ADMIN")) throw new Error("FORBIDDEN");
  const input = inputSchema.parse({ id, status });
  await prisma.report.update({ where: { id: input.id }, data: { status: input.status } });
  revalidatePath("/admin/reports");
}
