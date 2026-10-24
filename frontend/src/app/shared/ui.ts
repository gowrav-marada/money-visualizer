import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const STYLES: Record<string, { label: string; tone: string }> = {
  Paid: { label: 'Paid', tone: 'green' },
  DueSoon: { label: 'Due soon', tone: 'amber' },
  Overdue: { label: 'Overdue', tone: 'red' },
  Upcoming: { label: 'Upcoming', tone: 'blue' },
  Ignored: { label: 'Ignored', tone: 'gray' },
  Pending: { label: 'Pending', tone: 'blue' },
  PartiallyPaid: { label: 'Partially paid', tone: 'amber' },
  Detected: { label: 'Needs review', tone: 'violet' },
  Confirmed: { label: 'Confirmed', tone: 'green' },
  Duplicate: { label: 'Duplicate', tone: 'amber' },
  Failed: { label: 'Failed', tone: 'red' },
  Receive: { label: 'To receive', tone: 'green' },
  Pay: { label: 'To pay', tone: 'red' }
};

@Component({
  selector: 'mv-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="pill" [class]="'pill ' + style().tone">{{ style().label }}</span>`
})
export class StatusPillComponent {
  readonly status = input.required<string>();
  readonly style = computed(() => STYLES[this.status()] ?? { label: this.status(), tone: 'gray' });
}

@Component({
  selector: 'mv-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="skeleton-grid">
      @for (i of cards(); track i) { <div class="skeleton card-sk"></div> }
    </div>
    @for (i of rows(); track i) { <div class="skeleton row-sk"></div> }
  `,
  styles: [`
    .skeleton-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 14px; margin-bottom: 18px; }
    .card-sk { height: 104px; border-radius: 18px; } .row-sk { height: 58px; border-radius: 14px; margin-bottom: 10px; }
  `]
})
export class SkeletonComponent {
  readonly cardCount = input(4);
  readonly rowCount = input(4);
  readonly cards = computed(() => Array.from({ length: this.cardCount() }, (_, i) => i));
  readonly rows = computed(() => Array.from({ length: this.rowCount() }, (_, i) => i));
}

@Component({
  selector: 'mv-empty',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty">
      <div class="empty-art">{{ emoji() }}</div>
      <h3>{{ title() }}</h3>
      <p>{{ message() }}</p>
      <ng-content />
    </div>
  `,
  styles: [`
    .empty { text-align: center; padding: 42px 16px; color: var(--muted); }
    .empty-art { font-size: 40px; width: 80px; height: 80px; margin: 0 auto 12px; display: grid; place-items: center; border-radius: 26px;
      background: linear-gradient(135deg, var(--brand-soft), var(--pink-soft)); }
    h3 { color: var(--text); margin: 0 0 6px; font-size: 17px; } p { margin: 0 0 16px; font-size: 14px; }
  `]
})
export class EmptyStateComponent {
  readonly emoji = input('✨');
  readonly title = input('Nothing here yet');
  readonly message = input('');
}
