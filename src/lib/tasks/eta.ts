export const ETA_PRESETS = [15, 30, 60] as const;

export function etaExpectedAt(etaMinutes: number, updatedAt: Date) {
  return new Date(updatedAt.getTime() + etaMinutes * 60_000);
}

export function remainingEtaMinutes(etaMinutes: number | null, updatedAt: Date | null, now = new Date()) {
  if (!etaMinutes || !updatedAt) return null;
  const remaining = Math.ceil((etaExpectedAt(etaMinutes, updatedAt).getTime() - now.getTime()) / 60_000);
  return remaining > 0 ? remaining : null;
}
