import { Injectable, signal } from '@angular/core';

export interface Toast { id: number; kind: 'success' | 'error' | 'info'; message: string; }

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private nextId = 1;

  success(message: string) { this.push('success', message); }
  error(message: string) { this.push('error', message); }
  info(message: string) { this.push('info', message); }

  dismiss(id: number) { this.toasts.update(list => list.filter(toast => toast.id !== id)); }

  private push(kind: Toast['kind'], message: string) {
    const id = this.nextId++;
    this.toasts.update(list => [...list.slice(-3), { id, kind, message }]);
    setTimeout(() => this.dismiss(id), kind === 'error' ? 6000 : 3500);
  }
}

export interface ConfirmRequest { title: string; message: string; confirmText?: string; danger?: boolean; resolve: (ok: boolean) => void; }

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly pending = signal<ConfirmRequest | null>(null);

  ask(title: string, message: string, confirmText = 'Delete', danger = true): Promise<boolean> {
    return new Promise(resolve => this.pending.set({ title, message, confirmText, danger, resolve }));
  }

  close(ok: boolean) {
    this.pending()?.resolve(ok);
    this.pending.set(null);
  }
}
