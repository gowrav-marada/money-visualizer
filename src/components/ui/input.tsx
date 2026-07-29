import { forwardRef, InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-11 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none transition focus:ring-2 focus:ring-primary",
      className
    )}
    {...props}
  />
));

Input.displayName = "Input";

export { Input };
