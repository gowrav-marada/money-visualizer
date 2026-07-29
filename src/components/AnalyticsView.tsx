import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { categoryBreakdown, getMonthlySeries, receivableVsPayable } from "../lib/insights";
import { formatINR } from "../lib/utils";
import { Transaction } from "../types";
import { Card } from "./ui/card";

const pieColors = ["#22c55e", "#ef4444", "#3b82f6", "#f59e0b", "#8b5cf6", "#06b6d4"];

export const AnalyticsView = ({ transactions }: { transactions: Transaction[] }) => {
  const monthly = getMonthlySeries(transactions);
  const donut = receivableVsPayable(transactions);
  const categories = categoryBreakdown(transactions);

  const netWorthSeries = monthly.map((item) => ({
    month: item.month,
    net: item.income + item.receivable - item.expense - item.payable
  }));

  return (
    <section className="space-y-3 pb-28">
      <Card className="h-72 space-y-2">
        <p className="text-sm font-medium">Interactive Cash Flow</p>
        <ResponsiveContainer width="100%" height="92%">
          <LineChart data={monthly}>
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={(value: number) => formatINR(value)} />
            <Legend />
            <Line type="monotone" dataKey="income" stroke="#3b82f6" strokeWidth={2.5} />
            <Line type="monotone" dataKey="expense" stroke="#f59e0b" strokeWidth={2.5} />
            <Line type="monotone" dataKey="receivable" stroke="#22c55e" strokeWidth={2.5} />
            <Line type="monotone" dataKey="payable" stroke="#ef4444" strokeWidth={2.5} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card className="h-64 space-y-2">
          <p className="text-sm font-medium">Receivable vs Payable</p>
          <ResponsiveContainer width="100%" height="90%">
            <PieChart>
              <Pie data={donut} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70}>
                {donut.map((_, index) => (
                  <Cell key={index} fill={index === 0 ? "#22c55e" : "#ef4444"} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => formatINR(value)} />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card className="h-64 space-y-2">
          <p className="text-sm font-medium">Category-wise Expense Breakdown</p>
          <ResponsiveContainer width="100%" height="90%">
            <PieChart>
              <Pie data={categories} dataKey="value" nameKey="name" outerRadius={72}>
                {categories.map((_, index) => (
                  <Cell key={index} fill={pieColors[index % pieColors.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => formatINR(value)} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card className="h-72 space-y-2">
        <p className="text-sm font-medium">Monthly Spending Trends</p>
        <ResponsiveContainer width="100%" height="92%">
          <BarChart data={monthly}>
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={(value: number) => formatINR(value)} />
            <Legend />
            <Bar dataKey="income" fill="#3b82f6" radius={[6, 6, 0, 0]} />
            <Bar dataKey="expense" fill="#f59e0b" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card className="h-60 space-y-2">
        <p className="text-sm font-medium">Net Worth Tracker</p>
        <ResponsiveContainer width="100%" height="88%">
          <LineChart data={netWorthSeries}>
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={(value: number) => formatINR(value)} />
            <Line type="monotone" dataKey="net" stroke="#8b5cf6" strokeWidth={3} />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </section>
  );
};
