export type TransactionType = 'Income' | 'Expense';
export type Direction = 'Receive' | 'Pay';
export type ReceivableStatus = 'Pending' | 'PartiallyPaid' | 'Paid' | 'Overdue';
export type BillType = 'CreditCard' | 'Telephone' | 'Internet' | 'Electricity' | 'Water' | 'Insurance' | 'Emi' | 'Rent' | 'Subscription' | 'Other';
export type BillStatus = 'Upcoming' | 'DueSoon' | 'Paid' | 'Overdue' | 'Ignored';
export type AccountKind = 'Bank' | 'CreditCard' | 'Cash' | 'Wallet' | 'Upi' | 'Other';
export type Frequency = 'Weekly' | 'Monthly' | 'Yearly';
export type MailProvider = 'Outlook' | 'Gmail';
export type EmailImportStatus = 'Detected' | 'Confirmed' | 'Ignored' | 'Duplicate' | 'Failed';
export type Theme = 'System' | 'Light' | 'Dark';

export const BILL_TYPES: { value: BillType; label: string }[] = [
  { value: 'CreditCard', label: 'Credit card' }, { value: 'Telephone', label: 'Mobile / telephone' },
  { value: 'Internet', label: 'Internet' }, { value: 'Electricity', label: 'Electricity' },
  { value: 'Water', label: 'Water' }, { value: 'Insurance', label: 'Insurance' },
  { value: 'Emi', label: 'EMI / loan' }, { value: 'Rent', label: 'Rent' },
  { value: 'Subscription', label: 'Subscription' }, { value: 'Other', label: 'Other' }
];
export const billTypeLabel = (type?: BillType | null) => BILL_TYPES.find(item => item.value === type)?.label ?? 'Other';

export interface Me { id: string; displayName: string; email: string; usesDevelopmentSignIn: boolean; }
export interface AmountCount { count: number; amount: number; }

export interface FinancialPosition {
  totalIncome: number; totalExpenses: number; currentBalance: number; toReceive: number; toPay: number;
  netReceivables: number; unpaidBills: number; netPosition: number;
}
export interface PersonBalance {
  personId: string; name: string; toReceive: number; toPay: number; settled: number; netBalance: number;
  nextDueDate: string | null; latestActivity: string; openRecords: number; hasOverdue: boolean;
}
export interface DashboardBill { id: string; provider: string; billType: BillType; unpaid: number; dueDate: string; status: BillStatus; daysUntilDue: number; }
export interface DashboardTransaction { id: string; type: TransactionType; amount: number; date: string; category: string; description: string; merchant: string | null; }
export interface PeriodBucket { label: string; start: string; income: number; expenses: number; }
export interface CategoryAmount { name: string; amount: number; }
export interface DashboardAlert { severity: 'info' | 'warning' | 'danger' | string; message: string; link: string | null; }
export interface CreditSummary {
  totalToReceive: number; totalToPay: number; netReceivable: number; totalSettled: number; totalPending: number;
  totalOverdue: number; peopleOweMe: number; peopleIOwe: number;
}
export interface Dashboard {
  position: FinancialPosition; overdueBills: AmountCount; unpaidBills: AmountCount; credits: CreditSummary;
  peopleOweMe: PersonBalance[]; peopleIOwe: PersonBalance[]; upcomingBills: DashboardBill[]; overdueBillList: DashboardBill[];
  recentExpenses: DashboardTransaction[]; recentIncome: DashboardTransaction[]; monthlyTrend: PeriodBucket[];
  spendingByCategory: CategoryAmount[]; thisMonthExpenses: number; previousMonthExpenses: number;
  monthlyBudget: number | null; alerts: DashboardAlert[];
}

export interface Credit {
  id: string; personId: string; personName: string; direction: Direction; amount: number; settledAmount: number;
  remaining: number; status: ReceivableStatus; transactionDate: string; expectedDate: string | null; description: string;
  paymentMethod: string | null; category: string | null; notes: string | null; reminderDate: string | null;
  latestActivity: string; attachmentCount: number;
}
export interface CreditRequest {
  personName: string; direction: Direction; amount: number | null; transactionDate: string; expectedDate: string | null;
  description: string; paymentMethod: string | null; category: string | null; notes: string | null;
  reminderDate: string | null; settledAmount: number;
}
export interface HistoryEntry { at: string; kind: string; description: string; amount: number | null; settlementId: string | null; }

export interface Transaction {
  id: string; type: TransactionType; amount: number; date: string; categoryId: string; categoryName: string;
  description: string; paymentMethod: string | null; accountId: string | null; accountName: string | null;
  merchant: string | null; notes: string | null; isRecurring: boolean; excludeFromTotals: boolean;
  isBillPayment: boolean; attachmentCount: number;
}
export interface TransactionRequest {
  type: TransactionType; amount: number | null; date: string; categoryId: string | null; description: string;
  paymentMethod: string | null; accountId: string | null; merchant: string | null; notes: string | null;
  isRecurring: boolean; frequency: Frequency | null;
}
export interface ExpenseSummary {
  totalIncome: number; totalExpenses: number; balance: number; thisMonthExpenses: number; previousMonthExpenses: number;
  averageDailySpending: number; highestCategory: CategoryAmount | null; monthlyBudget: number | null;
  filteredIncome: number; filteredExpenses: number;
}

export interface BillPayment { id: string; amount: number; date: string; paymentMethod: string | null; personalTransactionId: string | null; }
export interface Bill {
  id: string; provider: string; billType: BillType; accountIdentifier: string | null; amount: number; minimumDue: number | null;
  paidAmount: number; unpaid: number; dueDate: string; periodStart: string | null; periodEnd: string | null; status: BillStatus;
  isRecurring: boolean; paymentDate: string | null; paymentMethod: string | null; emailSource: string | null; fromEmail: boolean;
  notes: string | null; daysUntilDue: number; attachmentCount: number; payments: BillPayment[];
}
export interface BillRequest {
  provider: string; billType: BillType; accountIdentifier: string | null; amount: number | null; minimumDue: number | null;
  dueDate: string; periodStart: string | null; periodEnd: string | null; isRecurring: boolean; paymentMethod: string | null;
  emailSource: string | null; notes: string | null; allowDuplicate?: boolean;
}
export interface BillSummary { unpaid: AmountCount; dueThisWeek: AmountCount; dueThisMonth: AmountCount; overdue: AmountCount; paidThisMonth: AmountCount; recurring: number; }

export interface Category { id: string; name: string; kind: 'Income' | 'Expense'; isSystem: boolean; excludeFromTotals: boolean; usageCount: number; }
export interface Account { id: string; name: string; kind: AccountKind; maskedNumber: string | null; isArchived: boolean; }
export interface Settings {
  currency: string; locale: string; dateFormat: string; timeZone: string; monthlyBudget: number | null; theme: Theme;
  notificationsEnabled: boolean; billReminderDays: number; dueSoonDays: number; paymentMethods: string[]; appLockEnabled: boolean;
}
export interface AppNotification { id: string; title: string; message: string; link: string | null; createdAt: string; isRead: boolean; }

export interface MailConnection { provider: MailProvider; emailAddress: string; connectedAt: string; lastSyncedAt: string | null; }
export interface EmailStatus { outlookConfigured: boolean; gmailConfigured: boolean; connections: MailConnection[]; counts: Partial<Record<EmailImportStatus, number>>; }
export interface EmailImport {
  id: string; provider: MailProvider; subject: string; fromAddress: string; receivedAt: string; importedAt: string;
  status: EmailImportStatus; providerName: string | null; billType: BillType | null; maskedAccount: string | null;
  amount: number | null; minimumDue: number | null; dueDate: string | null; periodStart: string | null; periodEnd: string | null;
  attachmentName: string | null; confidence: number; isLowConfidence: boolean; looksLikePayment: boolean;
  failureReason: string | null; billId: string | null; duplicateOfBillId: string | null;
}

export const today = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
