import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { PreferencesService } from '../core/preferences.service';

export interface BarSeries { label: string; values: number[]; color: string; }

/** Lightweight responsive SVG grouped bar chart (no chart library needed). */
@Component({
  selector: 'mv-bar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!hasData()) {
      <p class="empty-mini">Not enough data yet</p>
    } @else {
      <svg [attr.viewBox]="'0 0 ' + width + ' ' + height" class="chart" role="img" [attr.aria-label]="ariaLabel()">
        @for (tick of ticks(); track $index) {
          <line [attr.x1]="pad" [attr.x2]="width" [attr.y1]="tick.y" [attr.y2]="tick.y" class="grid" />
          <text [attr.x]="pad - 6" [attr.y]="tick.y + 4" text-anchor="end" class="axis">{{ tick.label }}</text>
        }
        @for (label of labels(); track $index; let i = $index) {
          @for (series of series(); track series.label; let s = $index) {
            <rect [attr.x]="barX(i, s)" [attr.y]="barY(series.values[i])" [attr.width]="barWidth()" [attr.height]="barH(series.values[i])"
                  [attr.fill]="series.color" rx="5">
              <title>{{ series.label }} · {{ label }}: {{ prefs.money(series.values[i]) }}</title>
            </rect>
          }
          <text [attr.x]="groupX(i) + groupWidth() / 2" [attr.y]="height - 4" text-anchor="middle" class="axis">{{ label }}</text>
        }
      </svg>
      <div class="legend">
        @for (series of series(); track series.label) {
          <span><i [style.background]="series.color"></i>{{ series.label }}</span>
        }
      </div>
    }
  `,
  styles: [`
    .chart { width: 100%; height: auto; display: block; }
    .grid { stroke: var(--line); stroke-dasharray: 3 4; }
    .axis { fill: var(--muted); font-size: 11px; }
    rect { transition: opacity .15s; } rect:hover { opacity: .8; }
    .legend { display: flex; gap: 16px; justify-content: center; font-size: 12px; color: var(--muted); margin-top: 6px; }
    .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; }
    .empty-mini { color: var(--muted); text-align: center; padding: 40px 0; font-size: 14px; }
  `]
})
export class BarChartComponent {
  readonly prefs = inject(PreferencesService);
  readonly labels = input.required<string[]>();
  readonly series = input.required<BarSeries[]>();
  readonly ariaLabel = input('Bar chart');
  readonly width = 560;
  readonly height = 220;
  readonly pad = 48;
  private readonly top = 10;
  private readonly bottom = 22;

  readonly max = computed(() => Math.max(1, ...this.series().flatMap(item => item.values)));
  readonly hasData = computed(() => this.labels().length > 0 && this.series().some(item => item.values.some(value => value > 0)));
  readonly groupWidth = computed(() => (this.width - this.pad) / Math.max(1, this.labels().length));
  readonly barWidth = computed(() => Math.min(26, (this.groupWidth() * 0.7) / Math.max(1, this.series().length)));
  readonly ticks = computed(() => {
    const plot = this.height - this.top - this.bottom;
    return [0, 0.5, 1].map(fraction => ({ y: this.top + plot * (1 - fraction), label: this.prefs.money(this.max() * fraction, true) }));
  });

  groupX(index: number) { return this.pad + index * this.groupWidth(); }
  barX(index: number, seriesIndex: number) {
    const total = this.barWidth() * this.series().length + 4 * (this.series().length - 1);
    return this.groupX(index) + (this.groupWidth() - total) / 2 + seriesIndex * (this.barWidth() + 4);
  }
  barH(value: number) { return Math.max(0, ((this.height - this.top - this.bottom) * value) / this.max()); }
  barY(value: number) { return this.height - this.bottom - this.barH(value); }
}

export interface DonutSlice { name: string; amount: number; }

export const PALETTE = ['#7c3aed', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6', '#8b5cf6', '#f97316', '#06b6d4'];

/** SVG donut chart with legend, used for spending by category. */
@Component({
  selector: 'mv-donut',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!total()) {
      <p class="empty-mini">No spending recorded this month</p>
    } @else {
      <div class="donut-wrap">
        <svg viewBox="0 0 120 120" class="donut" role="img" aria-label="Spending by category">
          @for (arc of arcs(); track arc.name) {
            <circle cx="60" cy="60" r="46" fill="none" [attr.stroke]="arc.color" stroke-width="18"
                    [attr.stroke-dasharray]="arc.dash" [attr.stroke-dashoffset]="arc.offset" transform="rotate(-90 60 60)">
              <title>{{ arc.name }}: {{ prefs.money(arc.amount) }}</title>
            </circle>
          }
          <text x="60" y="57" text-anchor="middle" class="t-label">Total</text>
          <text x="60" y="73" text-anchor="middle" class="t-value">{{ prefs.money(total(), true) }}</text>
        </svg>
        <ul class="legend">
          @for (arc of arcs(); track arc.name) {
            <li><i [style.background]="arc.color"></i><span>{{ arc.name }}</span><b>{{ arc.percent }}%</b></li>
          }
        </ul>
      </div>
    }
  `,
  styles: [`
    .donut-wrap { display: grid; grid-template-columns: minmax(120px, 170px) 1fr; gap: 20px; align-items: center; }
    .donut { width: 100%; }
    .t-label { fill: var(--muted); font-size: 9px; } .t-value { fill: var(--text); font-size: 13px; font-weight: 700; }
    .legend { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; font-size: 13px; }
    .legend li { display: grid; grid-template-columns: 12px 1fr auto; gap: 8px; align-items: center; }
    .legend i { width: 12px; height: 12px; border-radius: 4px; }
    .legend b { color: var(--muted); font-weight: 600; }
    .empty-mini { color: var(--muted); text-align: center; padding: 40px 0; font-size: 14px; }
    @media (max-width: 420px) { .donut-wrap { grid-template-columns: 1fr; } .donut { max-width: 170px; margin: auto; } }
  `]
})
export class DonutComponent {
  readonly prefs = inject(PreferencesService);
  readonly slices = input.required<DonutSlice[]>();
  readonly total = computed(() => this.slices().reduce((sum, slice) => sum + slice.amount, 0));
  readonly arcs = computed(() => {
    const circumference = 2 * Math.PI * 46;
    let used = 0;
    const sorted = [...this.slices()].sort((a, b) => b.amount - a.amount);
    const top = sorted.slice(0, 7);
    const rest = sorted.slice(7).reduce((sum, slice) => sum + slice.amount, 0);
    if (rest > 0) top.push({ name: 'Others', amount: rest });
    return top.map((slice, index) => {
      const length = (slice.amount / this.total()) * circumference;
      const arc = {
        ...slice, color: PALETTE[index % PALETTE.length],
        dash: `${length} ${circumference - length}`, offset: -used,
        percent: Math.round((slice.amount / this.total()) * 100)
      };
      used += length;
      return arc;
    });
  });
}
