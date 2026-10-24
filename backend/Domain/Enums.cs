namespace MoneyVisualizer.Api.Domain;

public enum TransactionType { Income, Expense }

public enum CategoryKind { Income, Expense }

public enum Direction { Receive, Pay }

public enum ReceivableStatus { Pending, PartiallyPaid, Paid, Overdue }

public enum BillType { CreditCard, Telephone, Internet, Electricity, Water, Insurance, Emi, Rent, Subscription, Other }

public enum BillStatus { Upcoming, DueSoon, Paid, Overdue, Ignored }

public enum AccountKind { Bank, CreditCard, Cash, Wallet, Upi, Other }

public enum RecurrenceFrequency { Weekly, Monthly, Yearly }

public enum MailProvider { Outlook, Gmail }

public enum EmailImportStatus { Detected, Confirmed, Ignored, Duplicate, Failed }

public enum ThemePreference { System, Light, Dark }

public enum AuditAction { Created, Updated, Deleted }
