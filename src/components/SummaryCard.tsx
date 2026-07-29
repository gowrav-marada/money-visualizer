import { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card } from "./ui/card";
import { cn } from "../lib/utils";

export const SummaryCard = ({
  title,
  value,
  delta,
  positive,
  icon
}: {
  title: string;
  value: string;
  delta?: string;
  positive?: boolean;
  icon: ReactNode;
}) => (
  <Card className="slide-up space-y-2">
    <div className="flex items-center justify-between text-muted-foreground">
      <span className="text-xs">{title}</span>
      {icon}
    </div>
    <p className="text-xl font-semibold tracking-tight">{value}</p>
    {delta ? (
      <div className={cn("flex items-center gap-1 text-xs", positive ? "text-receive" : "text-pay")}>
        {positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
        <span>{delta}</span>
      </div>
    ) : null}
  </Card>
);
