import * as React from "react";

import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-12 w-full rounded-2xl border border-stone-200 bg-white px-4 text-base text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-50 dark:focus:ring-emerald-950",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
