import "server-only";

import type { NextRequest } from "next/server";

import { serverEnv } from "@/config/server-env";

export function assertSameOrigin(request: NextRequest): void {
  const origin = request.headers.get("origin");
  if (!origin) return;

  let requestOrigin: string;
  try {
    requestOrigin = new URL(origin).origin;
  } catch {
    throw new Error("INVALID_ORIGIN");
  }

  const allowedOrigins = new Set([
    request.nextUrl.origin,
    new URL(serverEnv.APP_URL).origin,
  ]);

  if (!allowedOrigins.has(requestOrigin)) {
    throw new Error("INVALID_ORIGIN");
  }
}
