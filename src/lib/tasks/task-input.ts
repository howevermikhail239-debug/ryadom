import { z } from "zod";

const taskInputShape = {
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(2000),
  categoryId: z.string().uuid(),
  priceRubles: z.string().trim(),
  paymentMethod: z.enum(["CASH", "TRANSFER"]),
  startsAt: z.string().datetime().nullable().optional(),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  addressLabel: z.string().trim().max(300).nullable().optional(),
};

export const createTaskSchema = z.object({
  ...taskInputShape,
  isUrgent: z.boolean().default(false),
  repeatOfTaskId: z.string().uuid().nullable().optional(),
  offerPreviousPerformer: z.boolean().default(false),
}).refine((value) => !value.offerPreviousPerformer || Boolean(value.repeatOfTaskId), {
  message: "REPEAT_TASK_REQUIRED",
  path: ["offerPreviousPerformer"],
});

export const updateTaskSchema = z.object({
  ...taskInputShape,
  isUrgent: z.boolean(),
});

export function resolveTaskTiming(
  input: { startsAt?: string | null; isUrgent: boolean },
  now = new Date(),
) {
  const startsAt = input.startsAt ? new Date(input.startsAt) : null;
  if (startsAt && startsAt.getTime() < now.getTime() - 60_000) {
    throw new Error("TASK_START_IN_PAST");
  }

  const expiresAt = startsAt
    ? new Date(startsAt.getTime() + 30 * 60_000)
    : new Date(now.getTime() + (input.isUrgent ? 60 : 120) * 60_000);

  return { startsAt, expiresAt };
}
