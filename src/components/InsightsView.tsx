import { Brain, Clock3, MessageCircleWarning, Sparkles } from "lucide-react";
import { smartInsights, topCounterparties } from "../lib/insights";
import { formatINR } from "../lib/utils";
import { Transaction } from "../types";
import { Card } from "./ui/card";

export const InsightsView = ({ transactions }: { transactions: Transaction[] }) => {
  const upcoming = transactions
    .filter((tx) => tx.status !== "paid")
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 3);

  const topReceivable = topCounterparties(transactions, "borrowed").slice(0, 3);
  const topPayable = topCounterparties(transactions, "lent").slice(0, 3);
  const generated = smartInsights(transactions);

  return (
    <section className="space-y-3 pb-28">
      <Card className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Brain size={16} className="text-primary" /> AI Spending Insights
        </div>
        <div className="space-y-1">
          {generated.map((item) => (
            <p className="text-sm text-muted-foreground" key={item.title}>
              {item.title}: {item.detail}
            </p>
          ))}
        </div>
      </Card>

      <Card className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Clock3 size={16} className="text-expense" /> Upcoming Payments
        </div>
        <div className="space-y-2">
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming payments.</p>
          ) : (
            upcoming.map((item) => (
              <p className="text-sm" key={item.id}>
                {item.personName} • {formatINR(item.amount)}
              </p>
            ))
          )}
        </div>
      </Card>

      <Card className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <MessageCircleWarning size={16} className="text-pay" /> WhatsApp Reminder Copy
        </div>
        <p className="text-sm text-muted-foreground">"Hi, quick reminder for pending settlement. Please clear when possible. Thanks!"</p>
      </Card>

      <Card className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles size={16} className="text-income" /> Top People Owing You
        </div>
        <div className="space-y-2">
          {topReceivable.map((item) => (
            <p className="text-sm" key={item.name}>
              {item.name} • {formatINR(item.amount)}
            </p>
          ))}
        </div>
      </Card>

      <Card className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles size={16} className="text-pay" /> People You Owe
        </div>
        <div className="space-y-2">
          {topPayable.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending payables.</p>
          ) : (
            topPayable.map((item) => (
              <p className="text-sm" key={item.name}>
                {item.name} • {formatINR(item.amount)}
              </p>
            ))
          )}
        </div>
      </Card>
    </section>
  );
};
