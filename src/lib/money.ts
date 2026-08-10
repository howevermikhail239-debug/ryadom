import "server-only";

export function rublesToKopecks(value: string): number {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Укажите сумму в рублях, не более двух знаков после запятой.");
  }

  const [rubles, kopecks = ""] = normalized.split(".");
  const result = Number(rubles) * 100 + Number(kopecks.padEnd(2, "0"));
  if (!Number.isSafeInteger(result) || result < 100 || result > 100_000_000) {
    throw new Error("Сумма должна быть от 1 ₽ до 1 000 000 ₽.");
  }
  return result;
}
