export type TransactionType = "borrowed" | "lent" | "expense" | "income";
export type PaymentStatus = "pending" | "overdue";

export interface Transaction {
  id: string;
  type: TransactionType;
  personName: string;
  amount: number;
  category: string;
  description: string;
  dueDate: string;
  date: string;
  status: PaymentStatus;
  notes: string;
  tags: string[];
  attachment?: string;
  recurring?: boolean;
}

export interface AppSettings {
  theme: "light" | "dark";
  voiceEntryEnabled: boolean;
}

export interface FinancialMetrics {
  totalReceivable: number;
  totalPayable: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  totalBalance: number;
  netCashPosition: number;
  financialHealthScore: number;
}

export interface Insight {
  title: string;
  detail: string;
  tone: "positive" | "neutral" | "alert";
}
