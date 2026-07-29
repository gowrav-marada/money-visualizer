import { Landmark, ReceiptIndianRupee, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { FinancialMetrics } from "../types";
import { formatINR } from "../lib/utils";
import { SummaryCard } from "./SummaryCard";
import { Card } from "./ui/card";
import { Progress } from "./ui/progress";

export const DashboardView = ({ metrics }: { metrics: FinancialMetrics }) => (
  <section className="space-y-3 pb-28">
    <div className="grid grid-cols-2 gap-3">
      <SummaryCard title="Total Balance" value={formatINR(metrics.totalBalance)} delta="Live cash signal" positive={metrics.totalBalance >= 0} icon={<Wallet size={16} />} />
      <SummaryCard title="Net Cash" value={formatINR(metrics.netCashPosition)} delta="Receivable - Payable" positive={metrics.netCashPosition >= 0} icon={<Landmark size={16} />} />
      <SummaryCard title="Receivable" value={formatINR(metrics.totalReceivable)} positive icon={<TrendingUp size={16} />} />
      <SummaryCard title="Payable" value={formatINR(metrics.totalPayable)} positive={false} icon={<TrendingDown size={16} />} />
      <SummaryCard title="Monthly Income" value={formatINR(metrics.monthlyIncome)} positive icon={<ReceiptIndianRupee size={16} />} />
      <SummaryCard title="Monthly Expense" value={formatINR(metrics.monthlyExpenses)} positive={false} icon={<ReceiptIndianRupee size={16} />} />
    </div>

    <Card className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Financial Health Score</p>
        <p className="text-sm font-semibold">{metrics.financialHealthScore}/100</p>
      </div>
      <Progress value={metrics.financialHealthScore} />
      <p className="text-xs text-muted-foreground">Higher score means better liquidity and monthly savings trend.</p>
    </Card>
  </section>
);
