import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: 'dashboard', title: 'Dashboard', loadComponent: () => import('./pages/dashboard.page').then(m => m.DashboardPage) },
  { path: 'credits', title: 'Credits & Debits', loadComponent: () => import('./pages/credits.page').then(m => m.CreditsPage) },
  { path: 'expenses', title: 'Expenses', loadComponent: () => import('./pages/expenses.page').then(m => m.ExpensesPage) },
  { path: 'bills', title: 'Bills', loadComponent: () => import('./pages/bills.page').then(m => m.BillsPage) },
  { path: 'settings', title: 'Settings', loadComponent: () => import('./pages/settings.page').then(m => m.SettingsPage) },
  { path: '**', redirectTo: 'dashboard' }
];
