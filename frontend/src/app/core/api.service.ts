import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  Account, AppNotification, Bill, BillRequest, BillSummary, Category, Credit, CreditRequest, CreditSummary, Dashboard,
  EmailImport, EmailStatus, ExpenseSummary, HistoryEntry, Me, PersonBalance, PeriodBucket, Settings, Transaction, TransactionRequest
} from './models';

type Query = Record<string, string | number | boolean | null | undefined>;

function params(query: Query = {}) {
  let result = new HttpParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== null && value !== undefined && value !== '' && value !== 'all') result = result.set(key, String(value));
  }
  return result;
}

/** Typed client for the ASP.NET Core API. All calls go through the dev proxy, so cookies stay same-origin. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  me() { return this.http.get<Me>('/api/auth/me'); }
  logout() { return this.http.post<void>('/api/auth/logout', {}); }
  dashboard() { return this.http.get<Dashboard>('/api/dashboard'); }

  credits(query: Query) { return this.http.get<Credit[]>('/api/credits', { params: params(query) }); }
  creditSummary() { return this.http.get<CreditSummary>('/api/credits/summary'); }
  people() { return this.http.get<PersonBalance[]>('/api/credits/people'); }
  personNames() { return this.http.get<string[]>('/api/credits/people/names'); }
  creditHistory(id: string) { return this.http.get<HistoryEntry[]>(`/api/credits/${id}/history`); }
  createCredit(body: CreditRequest) { return this.http.post<Credit>('/api/credits', body); }
  updateCredit(id: string, body: CreditRequest) { return this.http.put<Credit>(`/api/credits/${id}`, body); }
  deleteCredit(id: string) { return this.http.delete<void>(`/api/credits/${id}`); }
  settle(id: string, body: { amount: number; date: string; paymentMethod: string | null; notes: string | null }) {
    return this.http.post<Credit>(`/api/credits/${id}/settlements`, body);
  }
  markPaid(id: string) { return this.http.post<Credit>(`/api/credits/${id}/mark-paid`, {}); }
  setReminder(id: string, reminderDate: string | null) { return this.http.put<Credit>(`/api/credits/${id}/reminder`, { reminderDate }); }

  transactions(query: Query) { return this.http.get<Transaction[]>('/api/expenses', { params: params(query) }); }
  expenseSummary(query: Query) { return this.http.get<ExpenseSummary>('/api/expenses/summary', { params: params(query) }); }
  periods(granularity: string, count = 8) { return this.http.get<PeriodBucket[]>('/api/expenses/periods', { params: params({ granularity, count }) }); }
  createTransaction(body: TransactionRequest) { return this.http.post<Transaction>('/api/expenses', body); }
  updateTransaction(id: string, body: TransactionRequest) { return this.http.put<Transaction>(`/api/expenses/${id}`, body); }
  deleteTransaction(id: string) { return this.http.delete<void>(`/api/expenses/${id}`); }
  exportUrl(query: Query) { return `/api/expenses/export?${params(query).toString()}`; }

  bills(query: Query) { return this.http.get<Bill[]>('/api/bills', { params: params(query) }); }
  billSummary() { return this.http.get<BillSummary>('/api/bills/summary'); }
  createBill(body: BillRequest) { return this.http.post<Bill>('/api/bills', body); }
  updateBill(id: string, body: BillRequest) { return this.http.put<Bill>(`/api/bills/${id}`, body); }
  deleteBill(id: string) { return this.http.delete<void>(`/api/bills/${id}`); }
  payBill(id: string, body: { amount: number; date: string; paymentMethod: string | null; recordAsExpense: boolean; categoryId: string | null; accountId: string | null }) {
    return this.http.post<Bill>(`/api/bills/${id}/payments`, body);
  }
  ignoreBill(id: string, ignored: boolean) { return this.http.put<Bill>(`/api/bills/${id}/ignore`, { ignored }); }

  emailStatus() { return this.http.get<EmailStatus>('/api/email/status'); }
  emailImports(status?: string) { return this.http.get<EmailImport[]>('/api/email/imports', { params: params({ status }) }); }
  syncEmail() { return this.http.post<{ scanned: number; detected: number; duplicates: number; failed: number; payments: number }>('/api/email/sync', {}); }
  confirmImport(id: string, bill: BillRequest) { return this.http.post<Bill>(`/api/email/imports/${id}/confirm`, { bill }); }
  ignoreImport(id: string) { return this.http.post<void>(`/api/email/imports/${id}/ignore`, {}); }
  restoreImport(id: string) { return this.http.post<void>(`/api/email/imports/${id}/restore`, {}); }
  disconnectEmail(provider: string, deleteImports: boolean) {
    return this.http.delete<void>(`/api/email/connections/${provider}`, { params: params({ deleteImports }) });
  }

  settings() { return this.http.get<Settings>('/api/settings'); }
  saveSettings(body: Omit<Settings, 'appLockEnabled'>) { return this.http.put<Settings>('/api/settings', body); }
  categories() { return this.http.get<Category[]>('/api/settings/categories'); }
  saveCategory(body: { name: string; kind: string; excludeFromTotals: boolean }, id?: string) {
    return id ? this.http.put<Category>(`/api/settings/categories/${id}`, body) : this.http.post<Category>('/api/settings/categories', body);
  }
  deleteCategory(id: string) { return this.http.delete<void>(`/api/settings/categories/${id}`); }
  accounts() { return this.http.get<Account[]>('/api/settings/accounts'); }
  saveAccount(body: { name: string; kind: string; number: string | null; isArchived: boolean }, id?: string) {
    return id ? this.http.put<Account>(`/api/settings/accounts/${id}`, body) : this.http.post<Account>('/api/settings/accounts', body);
  }
  deleteAccount(id: string) { return this.http.delete<void>(`/api/settings/accounts/${id}`); }
  setPin(pin: string, currentPin: string | null) { return this.http.post<void>('/api/settings/lock', { pin, currentPin }); }
  verifyPin(pin: string) { return this.http.post<void>('/api/settings/lock/verify', { pin }); }
  disableLock(pin: string) { return this.http.post<void>('/api/settings/lock/disable', { pin }); }
  deleteEverything() { return this.http.post<void>('/api/settings/delete-account', { confirmation: 'DELETE' }); }

  uploadAttachment(ownerType: string, ownerId: string, file: File) {
    const body = new FormData();
    body.append('ownerType', ownerType);
    body.append('ownerId', ownerId);
    body.append('file', file);
    return this.http.post<{ id: string }>('/api/attachments', body);
  }

  notifications() { return this.http.get<AppNotification[]>('/api/notifications'); }
  readNotification(id: string) { return this.http.post<void>(`/api/notifications/${id}/read`, {}); }
  readAllNotifications() { return this.http.post<void>('/api/notifications/read-all', {}); }
}
