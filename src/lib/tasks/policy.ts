export const TASK_MANAGEABLE_STATUSES = ["DRAFT", "PUBLISHED", "MATCHING"] as const;
export const TASK_AVAILABLE_STATUSES = ["PUBLISHED", "MATCHING"] as const;
export const VISIBLE_MATCH_STATUSES = ["CREATED", "CONFIRMED", "IN_PROGRESS", "COMPLETED"] as const;
export const ACTIVE_MATCH_STATUSES = ["CREATED", "CONFIRMED", "IN_PROGRESS"] as const;
export const REPEATABLE_TASK_STATUSES = ["COMPLETED", "CANCELLED", "EXPIRED"] as const;

export function isTaskManageableStatus(status: string) {
  return TASK_MANAGEABLE_STATUSES.some((candidate) => candidate === status);
}

export function isTaskAvailableStatus(status: string) {
  return TASK_AVAILABLE_STATUSES.some((candidate) => candidate === status);
}

export function isRepeatableTaskStatus(status: string) {
  return REPEATABLE_TASK_STATUSES.some((candidate) => candidate === status);
}

export function canSeeExactTaskLocation(input: {
  currentUserId?: string | null;
  customerId: string;
  performerId?: string | null;
  isAdmin: boolean;
}) {
  if (input.isAdmin) return true;
  if (!input.currentUserId) return false;
  return input.currentUserId === input.customerId || input.currentUserId === input.performerId;
}
