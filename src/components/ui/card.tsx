import { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export const Card = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("glass rounded-2xl p-4", className)} {...props} />
);
