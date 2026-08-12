function originOf(value: string | null | undefined) {
  if (!value) return null;
  try { return new URL(value).origin; } catch { return null; }
}

export function isAllowedRequestOrigin(input: {
  origin: string | null;
  requestOrigin: string;
  appOrigin: string;
  forwardedHost: string | null;
  forwardedProto: string | null;
}) {
  if (!input.origin) return true;
  const received = originOf(input.origin);
  if (!received) return false;
  const allowed = new Set([originOf(input.requestOrigin), originOf(input.appOrigin)].filter((value): value is string => Boolean(value)));
  const host = input.forwardedHost?.split(",", 1)[0]?.trim();
  const protocol = input.forwardedProto?.split(",", 1)[0]?.trim().replace(/:$/, "");
  if (host && protocol && (protocol === "http" || protocol === "https")) {
    const forwardedOrigin = originOf(`${protocol}://${host}`);
    if (forwardedOrigin) allowed.add(forwardedOrigin);
  }
  return allowed.has(received);
}
