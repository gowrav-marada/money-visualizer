import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { Dashboard, billTypeLabel } from '../core/models';
import { PreferencesService } from '../core/preferences.service';
import { BarChartComponent, DonutComponent } from '../shared/charts';
import { IconComponent } from '../shared/icon.component';
import { EmptyStateComponent, SkeletonComponent, StatusPillComponent } from '../shared/ui';

interface StatCard { label: string; value: number; hint: string; icon: string; tone: string; link: string; query?: Record<string, string>; hero?: boolean; signed?: boolean; }

@Component({
  selector: 'mv-dashboard',
  imports: [RouterLink, IconComponent, BarChartComponent, DonutComponent, SkeletonComponent, StatusPillComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-head">
      <div>
        <h1>Hello 👋</h1>
        <p>Here's where your money stands today.</p>
      </div>
    </div>

    @if (data(); as d) {
      @if (d.alerts.length) {
        <div class="alerts">
          @for (alert of d.alerts; track $index) {
            <button type="button" [class]="'alert ' + alert.severity" (click)="go(alert.link)">
              <mv-icon [name]="alert.severity === 'danger' ? 'alert' : alert.severity === 'warning' ? 'clock' : 'info'" [size]="18" />
              {{ alert.message }}
            </button>
          }
        </div>
      }

      <div class="grid-cards">
        @for (card of cards(); track card.label) {
          <button type="button" class="stat" [class]="'stat tone-' + card.tone" [class.hero]="card.hero" (click)="open(card)">
            <span class="label"><span class="chip-icon"><mv-icon [name]="card.icon" [size]="17" /></span>{{ card.label }}</span>
            <span class="value" [class.neg]="card.signed && card.value < 0 && !card.hero">{{ prefs.money(card.value) }}</span>
            <span class="hint">{{ card.hint }}</span>
          </button>
        }
      </div>

      @if (d.monthlyBudget) {
        <div class="panel" style="margin-bottom:16px">
          <div class="panel-head"><h2>Monthly budget</h2><span class="muted" style="margin-left:auto">{{ prefs.money(d.thisMonthExpenses) }} of {{ prefs.money(d.monthlyBudget) }}</span></div>
          <div class="progress" [class.warn]="budgetPercent() >= 80" [class.bad]="budgetPercent() >= 100"><span [style.width.%]="Math.min(100, budgetPercent())"></span></div>
          <p class="muted" style="margin:8px 0 0;font-size:13px">{{ budgetPercent() }}% used this month</p>
        </div>
      }

      <div class="grid-3">
        <section class="panel">
          <div class="panel-head"><h2>Income vs expenses</h2><span class="muted" style="margin-left:auto;font-size:13px">Last 6 months</span></div>
          <mv-bar-chart [labels]="trendLabels()" [series]="trendSeries()" ariaLabel="Income versus expenses by month" />
        </section>
        <section class="panel">
          <div class="panel-head"><h2>Spending by category</h2></div>
          <mv-donut [slices]="d.spendingByCategory" />
        </section>
      </div>

      <div class="grid-2">
        <section class="panel">
          <div class="panel-head"><h2>Credit vs debit</h2><a class="link-btn" routerLink="/credits">Open</a></div>
          <div class="split">
            <div><span class="muted">To receive</span><b class="pos">{{ prefs.money(d.credits.totalToReceive) }}</b></div>
            <div><span class="muted">To pay</span><b class="neg">{{ prefs.money(d.credits.totalToPay) }}</b></div>
          </div>
          <div class="bar-split">
            <span class="g" [style.flex]="d.credits.totalToReceive || 0.0001"></span>
            <span class="r" [style.flex]="d.credits.totalToPay || 0.0001"></span>
          </div>
          <p class="muted" style="margin:10px 0 0;font-size:13px">Net: <b [class.pos]="d.credits.netReceivable >= 0" [class.neg]="d.credits.netReceivable < 0">{{ prefs.money(d.credits.netReceivable) }}</b>
            · Overdue {{ prefs.money(d.credits.totalOverdue) }}</p>
        </section>
        <section class="panel">
          <div class="panel-head"><h2>Monthly spending</h2></div>
          <div class="split">
            <div><span class="muted">This month</span><b>{{ prefs.money(d.thisMonthExpenses) }}</b></div>
            <div><span class="muted">Last month</span><b>{{ prefs.money(d.previousMonthExpenses) }}</b></div>
          </div>
          <p class="trend" [class.neg]="spendChange() > 0" [class.pos]="spendChange() <= 0">
            <mv-icon [name]="spendChange() > 0 ? 'up' : 'down'" />
            {{ Math.abs(spendChange()) }}% {{ spendChange() > 0 ? 'more' : 'less' }} than last month
          </p>
        </section>
      </div>

      <div class="grid-2">
        <section class="panel">
          <div class="panel-head"><h2>People who owe me</h2><a class="link-btn" routerLink="/credits" [queryParams]="{ direction: 'Receive' }">View all</a></div>
          @for (person of d.peopleOweMe.slice(0, 5); track person.personId) {
            <a class="list-item" routerLink="/credits" [queryParams]="{ person: person.name }">
              <span class="dot-icon" style="background:var(--green-soft);color:var(--green)">{{ person.name.charAt(0) }}</span>
              <span class="grow"><span class="title">{{ person.name }}</span><span class="sub">Due {{ prefs.date(person.nextDueDate) }}</span></span>
              <span class="amount pos">{{ prefs.money(person.toReceive) }}</span>
            </a>
          } @empty { <p class="muted">Nobody owes you money right now.</p> }
        </section>
        <section class="panel">
          <div class="panel-head"><h2>People I owe</h2><a class="link-btn" routerLink="/credits" [queryParams]="{ direction: 'Pay' }">View all</a></div>
          @for (person of d.peopleIOwe.slice(0, 5); track person.personId) {
            <a class="list-item" routerLink="/credits" [queryParams]="{ person: person.name }">
              <span class="dot-icon" style="background:var(--red-soft);color:var(--red)">{{ person.name.charAt(0) }}</span>
              <span class="grow"><span class="title">{{ person.name }}</span><span class="sub">Due {{ prefs.date(person.nextDueDate) }}</span></span>
              <span class="amount neg">{{ prefs.money(person.toPay) }}</span>
            </a>
          } @empty { <p class="muted">You don't owe anyone. 🎉</p> }
        </section>
      </div>

      <div class="grid-2">
        <section class="panel">
          <div class="panel-head"><h2>Upcoming bills</h2><a class="link-btn" routerLink="/bills">View all</a></div>
          @for (bill of d.upcomingBills.slice(0, 5); track bill.id) {
            <a class="list-item" routerLink="/bills" [queryParams]="{ status: bill.status }">
              <span class="dot-icon" style="background:var(--blue-soft);color:var(--blue)"><mv-icon name="bill" [size]="18" /></span>
              <span class="grow"><span class="title">{{ bill.provider }}</span><span class="sub">{{ billTypeLabel(bill.billType) }} · {{ dueText(bill.daysUntilDue) }}</span></span>
              <span class="amount">{{ prefs.money(bill.unpaid) }}</span>
            </a>
          } @empty { <p class="muted">No upcoming bills.</p> }
        </section>
        <section class="panel">
          <div class="panel-head"><h2>Overdue bills</h2><a class="link-btn" routerLink="/bills" [queryParams]="{ status: 'Overdue' }">View all</a></div>
          @for (bill of d.overdueBillList.slice(0, 5); track bill.id) {
            <a class="list-item" routerLink="/bills" [queryParams]="{ status: 'Overdue' }">
              <span class="dot-icon" style="background:var(--red-soft);color:var(--red)"><mv-icon name="alert" [size]="18" /></span>
              <span class="grow"><span class="title">{{ bill.provider }}</span><span class="sub">{{ -bill.daysUntilDue }} day(s) late</span></span>
              <mv-status status="Overdue" />
              <span class="amount">{{ prefs.money(bill.unpaid) }}</span>
            </a>
          } @empty { <p class="muted">Nothing overdue. Great job!</p> }
        </section>
      </div>

      <div class="grid-2">
        <section class="panel">
          <div class="panel-head"><h2>Recent expenses</h2><a class="link-btn" routerLink="/expenses" [queryParams]="{ type: 'Expense' }">View all</a></div>
          @for (item of d.recentExpenses; track item.id) {
            <div class="list-item">
              <span class="dot-icon" style="background:var(--pink-soft);color:var(--pink)"><mv-icon name="arrowOut" [size]="18" /></span>
              <span class="grow"><span class="title">{{ item.description }}</span><span class="sub">{{ item.category }} · {{ prefs.date(item.date) }}</span></span>
              <span class="amount neg">−{{ prefs.money(item.amount) }}</span>
            </div>
          } @empty { <p class="muted">No expenses yet.</p> }
        </section>
        <section class="panel">
          <div class="panel-head"><h2>Recent income</h2><a class="link-btn" routerLink="/expenses" [queryParams]="{ type: 'Income' }">View all</a></div>
          @for (item of d.recentIncome; track item.id) {
            <div class="list-item">
              <span class="dot-icon" style="background:var(--teal-soft);color:var(--teal)"><mv-icon name="arrowIn" [size]="18" /></span>
              <span class="grow"><span class="title">{{ item.description }}</span><span class="sub">{{ item.category }} · {{ prefs.date(item.date) }}</span></span>
              <span class="amount pos">+{{ prefs.money(item.amount) }}</span>
            </div>
          } @empty { <p class="muted">No income yet.</p> }
        </section>
      </div>

      <section class="panel">
        <div class="panel-head"><h2>Monthly financial trend</h2><span class="muted" style="margin-left:auto;font-size:13px">Net saved each month</span></div>
        <mv-bar-chart [labels]="trendLabels()" [series]="netSeries()" ariaLabel="Net savings per month" />
      </section>
    } @else if (failed()) {
      <mv-empty emoji="⚠️" title="Couldn't load your dashboard" message="Check that the backend is running, then try again.">
        <button class="btn" type="button" (click)="load()">Retry</button>
      </mv-empty>
    } @else {
      <mv-skeleton [cardCount]="8" [rowCount]="3" />
    }
  `,
  styles: [`
    .split { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .split div { display: grid; gap: 2px; } .split b { font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; }
    .bar-split { display: flex; gap: 4px; height: 12px; margin-top: 14px; border-radius: 99px; overflow: hidden; }
    .bar-split .g { background: linear-gradient(90deg, var(--teal), var(--green)); } .bar-split .r { background: linear-gradient(90deg, var(--pink), var(--red)); }
    .trend { display: flex; align-items: center; gap: 4px; font-weight: 700; margin: 14px 0 0; font-size: 14px; }
  `]
})
export class DashboardPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  readonly prefs = inject(PreferencesService);
  readonly data = signal<Dashboard | null>(null);
  readonly failed = signal(false);
  readonly Math = Math;
  readonly billTypeLabel = billTypeLabel;

  readonly cards = computed<StatCard[]>(() => {
    const d = this.data();
    if (!d) return [];
    const p = d.position;
    const cards: StatCard[] = [
      { label: 'Net financial position', value: p.netPosition, hint: 'Balance + net receivables − unpaid bills', icon: 'wallet', tone: 'violet', link: '/dashboard', hero: true, signed: true },
      { label: 'Current balance', value: p.currentBalance, hint: 'Income − personal expenses', icon: 'card', tone: 'teal', link: '/expenses', signed: true },
      { label: 'Total income', value: p.totalIncome, hint: 'All personal income', icon: 'arrowIn', tone: 'green', link: '/expenses', query: { type: 'Income' } },
      { label: 'Personal expenses', value: p.totalExpenses, hint: 'Excludes card-bill transfers', icon: 'arrowOut', tone: 'pink', link: '/expenses', query: { type: 'Expense' } },
      { label: 'To receive', value: p.toReceive, hint: `${d.credits.peopleOweMe} people owe you`, icon: 'arrowIn', tone: 'green', link: '/credits', query: { direction: 'Receive' } },
      { label: 'To pay', value: p.toPay, hint: `You owe ${d.credits.peopleIOwe} people`, icon: 'arrowOut', tone: 'red', link: '/credits', query: { direction: 'Pay' } },
      { label: 'Unpaid bills', value: d.unpaidBills.amount, hint: `${d.unpaidBills.count} bill(s) open`, icon: 'bill', tone: 'blue', link: '/bills', query: { status: 'unpaid' } },
      { label: 'Overdue bills', value: d.overdueBills.amount, hint: `${d.overdueBills.count} bill(s) overdue`, icon: 'alert', tone: 'amber', link: '/bills', query: { status: 'Overdue' } }
    ];
    return cards;
  });

  readonly trendLabels = computed(() => this.data()?.monthlyTrend.map(bucket => bucket.label) ?? []);
  readonly trendSeries = computed(() => {
    const trend = this.data()?.monthlyTrend ?? [];
    return [
      { label: 'Income', values: trend.map(bucket => bucket.income), color: '#10b981' },
      { label: 'Expenses', values: trend.map(bucket => bucket.expenses), color: '#ec4899' }
    ];
  });
  readonly netSeries = computed(() => {
    const trend = this.data()?.monthlyTrend ?? [];
    return [{ label: 'Saved', values: trend.map(bucket => Math.max(0, bucket.income - bucket.expenses)), color: '#7c3aed' }];
  });
  readonly spendChange = computed(() => {
    const d = this.data();
    if (!d || !d.previousMonthExpenses) return 0;
    return Math.round(((d.thisMonthExpenses - d.previousMonthExpenses) / d.previousMonthExpenses) * 100);
  });
  readonly budgetPercent = computed(() => {
    const d = this.data();
    return d?.monthlyBudget ? Math.round((d.thisMonthExpenses / d.monthlyBudget) * 100) : 0;
  });

  ngOnInit() { this.load(); }

  load() {
    this.failed.set(false);
    this.data.set(null);
    this.api.dashboard().subscribe({ next: data => this.data.set(data), error: () => this.failed.set(true) });
  }

  open(card: StatCard) { if (card.link !== '/dashboard') this.router.navigate([card.link], { queryParams: card.query }); }
  go(link: string | null) { if (link) this.router.navigateByUrl(link); }

  dueText(days: number) {
    if (days === 0) return 'Due today';
    if (days === 1) return 'Due tomorrow';
    return days > 0 ? `Due in ${days} days` : `${-days} days late`;
  }
}
