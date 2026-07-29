import { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export const Badge = ({ className, ...props }: HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium", className)} {...props} />
);
