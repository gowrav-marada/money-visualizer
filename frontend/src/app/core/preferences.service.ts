import { Injectable, effect, signal } from '@angular/core';
import { Settings, Theme } from './models';

/** Holds user preferences used for money/date formatting and theme across the app. */
@Injectable({ providedIn: 'root' })
export class PreferencesService {
  readonly currency = signal('INR');
  readonly locale = signal('en-IN');
  readonly dateFormat = signal('dd MMM yyyy');
  readonly theme = signal<Theme>((localStorage.getItem('mv.theme') as Theme) || 'System');

  constructor() {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const mode = this.theme();
      const dark = mode === 'Dark' || (mode === 'System' && media.matches);
      document.documentElement.classList.toggle('dark', dark);
    };
    media.addEventListener('change', apply);
    effect(() => { localStorage.setItem('mv.theme', this.theme()); apply(); });
  }

  apply(settings: Settings) {
    this.currency.set(settings.currency || 'INR');
    this.locale.set(settings.locale || 'en-IN');
    this.dateFormat.set(settings.dateFormat || 'dd MMM yyyy');
    this.theme.set(settings.theme);
  }

  money(value: number | null | undefined, compact = false): string {
    const amount = value ?? 0;
    return new Intl.NumberFormat(this.locale(), {
      style: 'currency', currency: this.currency(),
      maximumFractionDigits: compact || Number.isInteger(amount) ? 0 : 2,
      notation: compact && Math.abs(amount) >= 100000 ? 'compact' : 'standard'
    }).format(amount);
  }

  date(value: string | null | undefined): string {
    if (!value) return '—';
    const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
    const format = this.dateFormat();
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    if (format === 'dd/MM/yyyy') return `${dd}/${mm}/${yyyy}`;
    if (format === 'MM/dd/yyyy') return `${mm}/${dd}/${yyyy}`;
    if (format === 'yyyy-MM-dd') return `${yyyy}-${mm}-${dd}`;
    return date.toLocaleDateString(this.locale(), { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
