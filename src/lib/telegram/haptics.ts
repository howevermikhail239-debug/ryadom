type NotificationType = "error" | "success" | "warning";

function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
}

export function telegramSelectionChanged(): void {
  const haptic = window.Telegram?.WebApp?.HapticFeedback;
  if (haptic) {
    haptic.selectionChanged();
    return;
  }
  // A very short fallback is enough for a discrete segmented-control change.
  vibrate(8);
}

export function telegramImpactMedium(): void {
  const haptic = window.Telegram?.WebApp?.HapticFeedback;
  if (haptic) {
    haptic.impactOccurred("medium");
    return;
  }
  vibrate(20);
}

export function telegramNotification(type: NotificationType): void {
  const haptic = window.Telegram?.WebApp?.HapticFeedback;
  if (haptic) {
    haptic.notificationOccurred(type);
    return;
  }
  vibrate(type === "success" ? [16, 40, 16] : type === "warning" ? [18, 35, 10] : [30, 45, 30]);
}
