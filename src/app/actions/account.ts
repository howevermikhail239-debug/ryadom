"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export type ProfileActionState = { ok: boolean; error: string };

const profileSchema = z.object({
  displayName: z.string().trim().min(2, "Имя должно содержать минимум 2 символа.").max(100, "Имя не должно быть длиннее 100 символов."),
  bio: z.string().trim().max(500, "Описание не должно быть длиннее 500 символов."),
});

export async function completeOnboardingAction(): Promise<{ ok: boolean }> {
  const user = await requireCurrentUser();
  await prisma.user.updateMany({
    where: { id: user.id, onboardingPassed: false },
    data: { onboardingPassed: true },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateProfileAction(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  try {
    const user = await requireCurrentUser();
    const parsed = profileSchema.safeParse({
      displayName: formData.get("displayName"),
      bio: formData.get("bio"),
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Проверьте данные профиля." };
    }
    await prisma.user.update({
      where: { id: user.id },
      data: {
        displayName: parsed.data.displayName,
        bio: parsed.data.bio || null,
      },
    });
    revalidatePath("/profile");
    revalidatePath(`/users/${user.id}`);
    revalidatePath("/", "layout");
    return { ok: true, error: "" };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error && error.message === "UNAUTHORIZED"
        ? "Сессия истекла. Войдите снова."
        : "Не удалось сохранить профиль. Попробуйте ещё раз.",
    };
  }
}
