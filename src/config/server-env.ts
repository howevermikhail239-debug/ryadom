import "server-only";

import { z } from "zod";

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  DIRECT_DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(2592000),
  OTP_PEPPER: z.string().min(32),
  OTP_TTL_SECONDS: z.coerce.number().int().min(60).max(600).default(300),
  SMS_PROVIDER: z.enum(["disabled", "sms_ru", "mock"]).default("disabled"),
  SMS_RU_API_ID: z.string().optional(),
  YANDEX_GEOCODER_API_KEY: z.string().min(20),
  TELEGRAM_BOT_TOKEN: z.string().regex(/^\d+:[A-Za-z0-9_-]{20,}$/),
  TELEGRAM_WEBHOOK_SECRET: z.string().regex(/^[A-Za-z0-9_-]{32,256}$/),
  ENABLE_TEST_AUTH: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  TEST_AUTH_ACCESS_CODE: z.string().min(6).max(128).optional(),
  TELEGRAM_OIDC_CLIENT_ID: z.string().min(1).optional(),
  TELEGRAM_OIDC_CLIENT_SECRET: z.string().min(20).optional(),
  TELEGRAM_OIDC_REDIRECT_URI: z.string().url().optional(),
  YOOKASSA_SHOP_ID: z.string().min(1).optional(),
  YOOKASSA_SECRET_KEY: z.string().min(20).optional(),
  YOOKASSA_WEBHOOK_TOKEN: z.string().min(32).optional(),
  REDIS_URL: z.string().url().optional(),
  INTERNAL_JOB_SECRET: z.string().min(32).optional(),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().min(1).optional(),
  S3_BUCKET: z.string().min(3).optional(),
  S3_ACCESS_KEY_ID: z.string().min(3).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(8).optional(),
  S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
});

const parsed = serverEnvSchema.superRefine((env, ctx) => {
  if (env.NODE_ENV === "production" && env.SMS_PROVIDER === "mock") {
    ctx.addIssue({
      code: "custom",
      path: ["SMS_PROVIDER"],
      message: "SMS_PROVIDER=mock запрещён в production",
    });
  }

  if (env.SMS_PROVIDER === "sms_ru" && !env.SMS_RU_API_ID) {
    ctx.addIssue({
      code: "custom",
      path: ["SMS_RU_API_ID"],
      message: "SMS_RU_API_ID обязателен для SMS_PROVIDER=sms_ru",
    });
  }

  if (env.ENABLE_TEST_AUTH && !env.TEST_AUTH_ACCESS_CODE) {
    ctx.addIssue({
      code: "custom",
      path: ["TEST_AUTH_ACCESS_CODE"],
      message: "TEST_AUTH_ACCESS_CODE обязателен при ENABLE_TEST_AUTH=true",
    });
  }

  const s3Values = [env.S3_ENDPOINT, env.S3_REGION, env.S3_BUCKET, env.S3_ACCESS_KEY_ID, env.S3_SECRET_ACCESS_KEY];
  if (s3Values.some(Boolean) && !s3Values.every(Boolean)) {
    ctx.addIssue({
      code: "custom",
      path: ["S3_ENDPOINT"],
      message: "Для S3-хранилища задайте endpoint, region, bucket, access key и secret key вместе",
    });
  }
});

export const serverEnv = parsed.parse(process.env);
