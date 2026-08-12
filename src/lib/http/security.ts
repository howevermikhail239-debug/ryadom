import "server-only";

import type { NextRequest } from "next/server";

import { serverEnv } from "@/config/server-env";
import { isAllowedRequestOrigin } from "@/lib/http/origin-policy";

export function assertSameOrigin(request: NextRequest): void {
  if (!isAllowedRequestOrigin({
    origin: request.headers.get("origin"),
    requestOrigin: request.nextUrl.origin,
    appOrigin: serverEnv.APP_URL,
    forwardedHost: request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
    forwardedProto: request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol,
  })) {
    throw new Error("INVALID_ORIGIN");
  }
}
