import * as React from "react";

import { cn } from "../../lib/cn";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-[var(--color-border)] bg-[var(--color-panel-muted)] px-2 py-1 text-xs font-semibold text-[var(--color-muted)]",
        className,
      )}
      {...props}
    />
  );
}
