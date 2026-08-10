import { UserRound } from "lucide-react";

import { cn } from "@/lib/utils";

export function UserAvatar({ name, avatarUrl, className }: { name: string; avatarUrl: string | null; className?: string }) {
  return <span className={cn("grid size-11 shrink-0 place-items-center overflow-hidden rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200", className)} aria-hidden="true">
    {avatarUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={avatarUrl} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
    ) : <><span className="sr-only">{name}</span><UserRound className="size-5" /></>}
  </span>;
}
