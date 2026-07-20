import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import * as React from "react";

import { cn } from "../../lib/cn";

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  readonly tone?: "info" | "error" | "success";
}

export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(function Alert(
  { children, className, tone = "info", ...props },
  ref,
) {
  const Icon = tone === "error" ? AlertCircle : tone === "success" ? CheckCircle2 : Info;

  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg border p-4 text-sm",
        tone === "error" && "border-red-200 bg-red-50 text-red-900",
        tone === "info" && "border-teal-100 bg-teal-50 text-teal-950",
        tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-950",
        className,
      )}
      ref={ref}
      role={tone === "error" ? "alert" : "status"}
      {...props}
    >
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 flex-none" />
      <div>{children}</div>
    </div>
  );
});
