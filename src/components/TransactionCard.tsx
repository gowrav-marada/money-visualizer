import { useRef, useState } from "react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { formatDate, formatINR } from "../lib/utils";
import { Transaction } from "../types";

const colorByType = {
  borrowed: "text-receive",
  lent: "text-pay",
  income: "text-income",
  expense: "text-expense"
};

const badgeByType = {
  borrowed: "bg-receive/10 border-receive/40 text-receive",
  lent: "bg-pay/10 border-pay/40 text-pay",
  income: "bg-income/10 border-income/40 text-income",
  expense: "bg-expense/10 border-expense/40 text-expense"
};

export const TransactionCard = ({
  item,
  onEdit,
  onDelete
}: {
  item: Transaction;
  onEdit: (item: Transaction) => void;
  onDelete: (id: string) => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const longPressTimer = useRef<number | null>(null);

  const clearLongPress = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const vibrate = (ms: number) => {
    navigator.vibrate?.(ms);
  };

  return (
    <Card
      className="space-y-3 transition hover:scale-[1.01]"
      onTouchStart={() => {
        longPressTimer.current = window.setTimeout(() => {
          setExpanded(true);
          vibrate(40);
        }, 500);
      }}
      onTouchEnd={clearLongPress}
      onMouseDown={() => {
        longPressTimer.current = window.setTimeout(() => setExpanded(true), 500);
      }}
      onMouseUp={clearLongPress}
      onMouseLeave={clearLongPress}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/25 text-center text-sm font-semibold leading-10 text-primary">
            {item.personName.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <p className="font-medium">{item.personName}</p>
            <p className="text-xs text-muted-foreground">{item.category}</p>
          </div>
        </div>
        <p className={`text-lg font-bold ${colorByType[item.type]}`}>{formatINR(item.amount)}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge className={badgeByType[item.type]}>{item.type}</Badge>
        <Badge className="border-border bg-muted text-muted-foreground">Due: {formatDate(item.dueDate)}</Badge>
        <Badge className="border-pay/30 bg-pay/10 text-pay">{item.status}</Badge>
      </div>

      <button type="button" className="w-full text-left text-sm text-muted-foreground" onClick={() => setExpanded((v) => !v)}>
        {item.description || "No description"}
      </button>

      {expanded ? (
        <div className="space-y-2 rounded-xl border border-border bg-background/60 p-3 text-sm">
          <p>{item.notes || "No notes added"}</p>
          <p className="text-xs text-muted-foreground">Tags: {item.tags.join(", ") || "none"}</p>
          {item.attachment ? (
            <a className="text-xs text-primary underline" href={item.attachment} target="_blank" rel="noreferrer">
              Open Receipt
            </a>
          ) : null}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={() => onEdit(item)}>
              Edit
            </Button>
            <Button size="sm" variant="danger" onClick={() => onDelete(item.id)}>
              Delete
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
};
