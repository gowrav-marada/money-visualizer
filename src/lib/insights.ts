import { Insight, Transaction } from "../types";
import { monthKey } from "./utils";

export const getMonthlySeries = (transactions: Transaction[]) => {
  const bucket = new Map<string, { month: string; income: number; expense: number; receivable: number; payable: number }>();

  for (const tx of transactions) {
    const key = monthKey(tx.date);
    const current = bucket.get(key) ?? { month: key, income: 0, expense: 0, receivable: 0, payable: 0 };

    if (tx.type === "income") current.income += tx.amount;
    if (tx.type === "expense") current.expense += tx.amount;
    if (tx.type === "borrowed") current.receivable += tx.amount;
    if (tx.type === "lent") current.payable += tx.amount;

    bucket.set(key, current);
  }

  return Array.from(bucket.values()).sort((a, b) => a.month.localeCompare(b.month));
};

export const categoryBreakdown = (transactions: Transaction[]) => {
  const bucket = new Map<string, number>();

  transactions
    .filter((tx) => tx.type === "expense")
    .forEach((tx) => bucket.set(tx.category, (bucket.get(tx.category) ?? 0) + tx.amount));

  return Array.from(bucket.entries()).map(([name, value]) => ({ name, value }));
};

export const receivableVsPayable = (transactions: Transaction[]) => {
  const receivable = transactions
    .filter((tx) => tx.type === "borrowed")
    .reduce((sum, tx) => sum + tx.amount, 0);

  const payable = transactions
    .filter((tx) => tx.type === "lent")
    .reduce((sum, tx) => sum + tx.amount, 0);

  return [
    { name: "Receivable", value: receivable },
    { name: "Payable", value: payable }
  ];
};

export const topCounterparties = (transactions: Transaction[], type: "borrowed" | "lent") => {
  const bucket = new Map<string, number>();

  transactions
    .filter((tx) => tx.type === type)
    .forEach((tx) => bucket.set(tx.personName, (bucket.get(tx.personName) ?? 0) + tx.amount));

  return Array.from(bucket.entries())
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);
};

export const smartInsights = (transactions: Transaction[]): Insight[] => {
  const monthly = getMonthlySeries(transactions);
  const latest = monthly[monthly.length - 1];
  const previous = monthly[monthly.length - 2];

  const incomeDelta = latest && previous ? latest.income - previous.income : 0;
  const expenseDelta = latest && previous ? latest.expense - previous.expense : 0;

  const overdue = transactions.filter((tx) => tx.status === "overdue").length;
  const biggestExpenseCategory = categoryBreakdown(transactions).sort((a, b) => b.value - a.value)[0];

  return [
    {
      title: "Monthly Comparison",
      detail: incomeDelta >= 0 ? `Income is up by ₹${incomeDelta}.` : `Income dropped by ₹${Math.abs(incomeDelta)} this month.`,
      tone: incomeDelta >= 0 ? "positive" : "alert"
    },
    {
      title: "Spending Trend",
      detail:
        expenseDelta > 0
          ? `Expenses increased by ₹${expenseDelta}. Reduce discretionary spends this week.`
          : `Expenses are controlled with ₹${Math.abs(expenseDelta)} lower outflow versus last month.`,
      tone: expenseDelta > 0 ? "alert" : "positive"
    },
    {
      title: "Biggest Spender Category",
      detail: biggestExpenseCategory ? `${biggestExpenseCategory.name} leads with ₹${biggestExpenseCategory.value}.` : "No expense data yet.",
      tone: "neutral"
    },
    {
      title: "Overdue Collections",
      detail: overdue ? `${overdue} transactions are overdue. Send reminders now.` : "No overdue transactions. Great discipline.",
      tone: overdue ? "alert" : "positive"
    }
  ];
};
