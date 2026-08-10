import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_YANDEX_MAPS_API_KEY: z.string().min(20),
  NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: z
    .string()
    .regex(/^[a-zA-Z0-9_]{5,32}$/),
});

// Explicit property access is required so Next.js can inline NEXT_PUBLIC values.
export const publicEnv = publicEnvSchema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_YANDEX_MAPS_API_KEY:
    process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY,
  NEXT_PUBLIC_TELEGRAM_BOT_USERNAME:
    process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME,
});
