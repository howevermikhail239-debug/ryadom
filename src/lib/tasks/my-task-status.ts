import type { MyTaskGroup, MyTaskItem } from "@/types/my-task";

export function myTaskGroup(item: MyTaskItem): MyTaskGroup {
  if (item.status === "COMPLETED") return "completed";
  if (["CANCELLED", "EXPIRED"].includes(item.status) || item.matchStatus === "CANCELLED") return "cancelled";
  return "active";
}
