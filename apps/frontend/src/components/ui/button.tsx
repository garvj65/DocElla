import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "../../lib/cn";

const buttonVariants = cva(
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-transparent px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    defaultVariants: {
      variant: "primary",
    },
    variants: {
      variant: {
        ghost:
          "border-[var(--color-border)] bg-transparent text-[var(--color-ink)] hover:bg-[var(--color-panel-muted)]",
        primary: "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]",
        secondary:
          "border-[var(--color-border)] bg-white text-[var(--color-ink)] hover:bg-[var(--color-panel-muted)]",
      },
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  readonly asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ asChild = false, className, variant, ...props }, ref) => {
    const Component = asChild ? Slot : "button";
    return (
      <Component className={cn(buttonVariants({ variant }), className)} ref={ref} {...props} />
    );
  },
);

Button.displayName = "Button";
