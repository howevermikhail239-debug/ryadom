"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export function NotificationLink({ notificationId, taskId, children }: { notificationId: string; taskId: string; children: ReactNode }) {
  return <Link
    href={`/tasks/${taskId}`}
    className="block"
    onClick={() => {
      void fetch(`/api/notifications/${notificationId}/open`, { method: "POST", keepalive: true });
    }}
  >{children}</Link>;
}
