import type { TaskFeedItem } from "@/types/task";

export type MyTaskRole = "customer" | "performer";
export type MyTaskGroup = "active" | "completed" | "cancelled";

export type MyTaskItem = {
  id: string;
  title: string;
  priceKopecks: number;
  tipAmount: number;
  status: TaskFeedItem["status"];
  matchStatus: "CREATED" | "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "DISPUTED" | null;
  role: MyTaskRole;
  awaitingConfirmation: boolean;
  createdAt: string;
  updatedAt: string;
  latitude: number;
  longitude: number;
};
