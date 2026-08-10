export type TaskFeedItem = {
  id: string;
  title: string;
  description: string;
  priceKopecks: number;
  latitude: number;
  longitude: number;
  addressLabel: string | null;
  startsAt: string | null;
  expiresAt: string;
  status: "DRAFT" | "PUBLISHED" | "MATCHING" | "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "EXPIRED" | "DISPUTED";
  distanceMeters: number | null;
  isUrgent: boolean;
  paymentMethod: "CASH" | "TRANSFER";
  awaitingConfirmation?: boolean;
  category: { slug: string; name: string; icon: string };
  customer: { id: string; displayName: string; avatarUrl: string | null; ratingAverage: number; ratingCount: number; telegramVerified: boolean };
};

export type CategoryOption = {
  id: string;
  slug: string;
  name: string;
  icon: string;
};

export type Coordinates = { latitude: number; longitude: number };
export type ExecutorPoint = Coordinates;
