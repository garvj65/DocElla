import * as React from "react";

import { cn } from "../../lib/cn";
import { inputClassName } from "./input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea className={cn(inputClassName, "min-h-28 resize-y", className)} ref={ref} {...props} />
));

Textarea.displayName = "Textarea";
