import * as React from "react";

import { cn } from "../../lib/cn";

export const inputClassName =
  "flex min-h-10 w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] shadow-sm outline-none transition-colors placeholder:text-[var(--color-muted)] focus-visible:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] disabled:cursor-not-allowed disabled:bg-[var(--color-panel-muted)] disabled:opacity-70 aria-[invalid=true]:border-[var(--color-danger)]";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input className={cn(inputClassName, className)} ref={ref} {...props} />
));

Input.displayName = "Input";
