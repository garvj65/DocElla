import type * as React from "react";

import { cn } from "../../lib/cn";

interface FieldMessageProps {
  readonly children?: React.ReactNode;
  readonly className?: string;
  readonly id?: string;
  readonly tone?: "description" | "error";
}

export function FieldMessage({ children, className, id, tone = "description" }: FieldMessageProps) {
  if (children === undefined || children === null || children === "") {
    return null;
  }

  return (
    <p
      className={cn(
        "text-sm leading-5",
        tone === "error" ? "font-medium text-[var(--color-danger)]" : "text-[var(--color-muted)]",
        className,
      )}
      id={id}
    >
      {children}
    </p>
  );
}
