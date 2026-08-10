import { notFound, redirect } from "next/navigation";

import { EditTaskForm } from "@/components/tasks/edit-task-form";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export default async function EditTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/tasks/${id}/edit`)}`);

  const [task, categories] = await Promise.all([
    prisma.task.findUnique({ where: { id } }),
    prisma.category.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, slug: true, name: true, icon: true } }),
  ]);
  if (!task) notFound();
  if (task.customerId !== user.id && !user.roles.includes("ADMIN")) notFound();
  if (!user.roles.includes("ADMIN") && !["DRAFT", "PUBLISHED", "MATCHING"].includes(task.status)) redirect(`/tasks/${id}`);

  return <EditTaskForm apiKey={process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY ?? ""} categories={categories} task={{
    id: task.id,
    categoryId: task.categoryId,
    title: task.title,
    description: task.description,
    priceRubles: (task.priceKopecks / 100).toFixed(task.priceKopecks % 100 ? 2 : 0),
    latitude: Number(task.latitude),
    longitude: Number(task.longitude),
    addressLabel: task.addressLabel,
    startsAt: task.startsAt?.toISOString() ?? null,
    isUrgent: task.isUrgent,
    paymentMethod: task.paymentMethod,
  }} />;
}
