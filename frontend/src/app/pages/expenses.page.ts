import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { Account, Category, ExpenseSummary, PeriodBucket, Transaction, TransactionRequest, TransactionType, today } from '../core/models';
import { PreferencesService } from '../core/preferences.service';
import { ConfirmService, ToastService } from '../core/toast.service';
import { BarChartComponent } from '../shared/charts';
import { DrawerComponent } from '../shared/drawer.component';
import { IconComponent } from '../shared/icon.component';
import { EmptyStateComponent, SkeletonComponent } from '../shared/ui';

@Component({
  selector: 'mv-expenses',
  imports: [FormsModule, IconComponent, DrawerComponent, BarChartComponent, SkeletonComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-head">
      <div><h1>Expenses</h1><p>Your personal income and spending.</p></div>
      <div class="actions">
        <a class="btn ghost" [href]="exportUrl()" download><mv-icon name="download" [size]="18" /> <span class="hide-mobile">Export CSV</span></a>
        <button class="btn hide-mobile" type="button" (click)="openForm()"><mv-icon name="plus" /> Add transaction</button>
      </div>
    </div>

    @if (summary(); as s) {
      <div class="grid-cards">
        <button type="button" class="stat hero" (click)="setType('all')"><span class="label"><span class="chip-icon"><mv-icon name="wallet" [size]="17" /></span>Remaining balance</span><span class="value">{{ prefs.money(s.balance) }}</span><span class="hint">Income − expenses</span></button>
        <button type="button" class="stat tone-green" (click)="setType('Income')"><span class="label"><span class="chip-icon"><mv-icon name="arrowIn" [size]="17" /></span>Total income</span><span class="value">{{ prefs.money(s.totalIncome) }}</span><span class="hint">All time</span></button>
        <button type="button" class="stat tone-pink" (click)="setType('Expense')"><span class="label"><span class="chip-icon"><mv-icon name="arrowOut" [size]="17" /></span>Total expenses</span><span class="value">{{ prefs.money(s.totalExpenses) }}</span><span class="hint">All time</span></button>
        <div class="stat tone-violet"><span class="label"><span class="chip-icon"><mv-icon name="clock" [size]="17" /></span>This month</span><span class="value">{{ prefs.money(s.thisMonthExpenses) }}</span><span class="hint">Last month {{ prefs.money(s.previousMonthExpenses) }}</span></div>
        <div class="stat tone-teal"><span class="label"><span class="chip-icon"><mv-icon name="card" [size]="17" /></span>Avg. daily spend</span><span class="value">{{ prefs.money(s.averageDailySpending) }}</span><span class="hint">This month</span></div>
        <div class="stat tone-amber"><span class="label"><span class="chip-icon"><mv-icon name="up" [size]="17" /></span>Top category</span><span class="value">{{ s.highestCategory?.name ?? '—' }}</span><span class="hint">{{ s.highestCategory ? prefs.money(s.highestCategory.amount) + ' this month' : 'No spending yet' }}</span></div>
      </div>
    }

    <section class="panel" style="margin-bottom:16px">
      <div class="panel-head">
        <h2>Spending trend</h2>
        <div class="segmented" style="margin:0 0 0 auto">
          @for (g of granularities; track g.value) { <button type="button" [class.active]="granularity() === g.value" (click)="setGranularity(g.value)">{{ g.label }}</button> }
        </div>
      </div>
      <mv-bar-chart [labels]="periodLabels()" [series]="periodSeries()" ariaLabel="Income and expenses by period" />
    </section>

    <div class="toolbar">
      <label class="search"><mv-icon name="search" [size]="18" /><input [(ngModel)]="search" (ngModelChange)="reload()" placeholder="Search description or merchant" /></label>
      <select class="input compact" [(ngModel)]="categoryId" (change)="reload()" aria-label="Category"><option value="">All categories</option>@for (c of filterCategories(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }</select>
      <select class="input compact" [(ngModel)]="accountId" (change)="reload()" aria-label="Account"><option value="">All accounts</option>@for (a of accounts(); track a.id) { <option [value]="a.id">{{ a.name }}</option> }</select>
      <select class="input compact" [(ngModel)]="paymentMethod" (change)="reload()" aria-label="Payment method"><option value="">All methods</option>@for (m of methods(); track m) { <option [value]="m">{{ m }}</option> }</select>
      <input class="input compact" type="date" [(ngModel)]="from" (change)="reload()" aria-label="From" />
      <input class="input compact" type="date" [(ngModel)]="to" (change)="reload()" aria-label="To" />
    </div>
    <div class="chips">
      @for (t of types; track t.value) { <button type="button" class="chip" [class.active]="type() === t.value" (click)="setType(t.value)">{{ t.label }}</button> }
      @for (r of ranges; track r.value) { <button type="button" class="chip" (click)="setRange(r.value)">{{ r.label }}</button> }
      @if (summary(); as s) { <span class="muted" style="margin-left:auto;font-size:13px;align-self:center">Filtered: <b class="pos">+{{ prefs.money(s.filteredIncome) }}</b> · <b class="neg">−{{ prefs.money(s.filteredExpenses) }}</b></span> }
    </div>

    @if (items(); as list) {
      @if (list.length) {
        <div class="panel table-desktop table-wrap">
          <table class="table">
            <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Account / method</th><th class="right">Amount</th><th></th></tr></thead>
            <tbody>
              @for (t of list; track t.id) {
                <tr>
                  <td>{{ prefs.date(t.date) }}</td>
                  <td><b>{{ t.description }}</b>
                    <span class="sub">{{ t.merchant || '' }} @if (t.isRecurring) { · 🔁 Recurring } @if (t.excludeFromTotals) { · Transfer (not counted) }</span></td>
                  <td><span class="pill" [class]="t.type === 'Income' ? 'pill green' : 'pill violet'">{{ t.categoryName }}</span></td>
                  <td>{{ t.accountName || '—' }}<span class="sub">{{ t.paymentMethod || '' }}</span></td>
                  <td class="right num"><b [class.pos]="t.type === 'Income'" [class.neg]="t.type === 'Expense' && !t.excludeFromTotals" [class.muted]="t.excludeFromTotals">{{ t.type === 'Income' ? '+' : '−' }}{{ prefs.money(t.amount) }}</b></td>
                  <td class="actions-cell">
                    <button class="icon-btn" type="button" title="Edit" (click)="openForm(t)"><mv-icon name="edit" [size]="18" /></button>
                    <button class="icon-btn danger" type="button" title="Delete" (click)="remove(t)"><mv-icon name="trash" [size]="18" /></button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="cards-mobile">
          @for (t of list; track t.id) {
            <div class="m-card" (click)="openForm(t)">
              <div class="top">
                <span class="dot-icon" [style.background]="t.type === 'Income' ? 'var(--teal-soft)' : 'var(--pink-soft)'" [style.color]="t.type === 'Income' ? 'var(--teal)' : 'var(--pink)'"><mv-icon [name]="t.type === 'Income' ? 'arrowIn' : 'arrowOut'" [size]="18" /></span>
                <span style="flex:1;min-width:0"><b>{{ t.description }}</b><span class="sub">{{ t.categoryName }} · {{ prefs.date(t.date) }}</span></span>
                <b class="num" [class.pos]="t.type === 'Income'" [class.neg]="t.type === 'Expense' && !t.excludeFromTotals">{{ t.type === 'Income' ? '+' : '−' }}{{ prefs.money(t.amount) }}</b>
              </div>
            </div>
          }
        </div>
      } @else {
        <mv-empty emoji="🧾" title="No transactions" message="Add income or expenses to see where your money goes.">
          <button class="btn" type="button" (click)="openForm()">Add transaction</button>
        </mv-empty>
      }
    } @else { <mv-skeleton [cardCount]="0" [rowCount]="6" /> }

    <button class="fab" type="button" aria-label="Add transaction" (click)="openForm()"><mv-icon name="plus" [size]="26" /></button>

    <mv-drawer [open]="drawerOpen()" [title]="editing() ? 'Edit transaction' : 'New transaction'" (closed)="drawerOpen.set(false)">
      <form class="form" (ngSubmit)="save()" #f="ngForm">
        <div class="type-toggle">
          <button type="button" class="red" [class.active]="form.type === 'Expense'" (click)="setFormType('Expense')">💸 Expense</button>
          <button type="button" class="green" [class.active]="form.type === 'Income'" (click)="setFormType('Income')">💰 Income</button>
        </div>
        <div class="form-row">
          <label class="field"><span>Amount *</span><input class="input" type="number" name="amount" [(ngModel)]="form.amount" required min="0.01" step="0.01" /></label>
          <label class="field"><span>Date *</span><input class="input" type="date" name="date" [(ngModel)]="form.date" required /></label>
        </div>
        <label class="field"><span>Category *</span><select class="input" name="cat" [(ngModel)]="form.categoryId" required>@for (c of formCategories(); track c.id) { <option [ngValue]="c.id">{{ c.name }}</option> }</select></label>
        @if (isTransferCategory()) { <div class="note-box warn">Credit-card payments are treated as transfers and not counted as expenses — your individual card purchases are already counted.</div> }
        <label class="field"><span>Description *</span><input class="input" name="desc" [(ngModel)]="form.description" required maxlength="200" /></label>
        <div class="form-row">
          <label class="field"><span>Merchant</span><input class="input" name="merchant" [(ngModel)]="form.merchant" /></label>
          <label class="field"><span>Payment method</span><select class="input" name="method" [(ngModel)]="form.paymentMethod"><option [ngValue]="null">—</option>@for (m of methods(); track m) { <option [ngValue]="m">{{ m }}</option> }</select></label>
        </div>
        <label class="field"><span>Account or card</span><select class="input" name="acct" [(ngModel)]="form.accountId"><option [ngValue]="null">—</option>@for (a of accounts(); track a.id) { <option [ngValue]="a.id">{{ a.name }} {{ a.maskedNumber || '' }}</option> }</select></label>
        @if (!editing()) {
          <label class="check"><input type="checkbox" name="rec" [(ngModel)]="form.isRecurring" /> Recurring transaction</label>
          @if (form.isRecurring) {
            <label class="field"><span>Repeats</span><select class="input" name="freq" [(ngModel)]="form.frequency"><option ngValue="Weekly">Weekly</option><option ngValue="Monthly">Monthly</option><option ngValue="Yearly">Yearly</option></select></label>
          }
        }
        <label class="field"><span>Notes</span><textarea class="input" name="notes" [(ngModel)]="form.notes"></textarea></label>
        <label class="field"><span>Receipt (PDF/image, max 5 MB)</span><input class="input" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" (change)="pickFile($event)" /></label>
        <div class="form-actions"><button class="btn ghost" type="button" (click)="drawerOpen.set(false)">Cancel</button><button class="btn" type="submit" [disabled]="busy() || f.invalid">Save</button></div>
      </form>
    </mv-drawer>
  `
})
export class ExpensesPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  readonly prefs = inject(PreferencesService);
  readonly typeParam = input<string | undefined>(undefined, { alias: 'type' });

  readonly types = [{ value: 'all', label: 'All' }, { value: 'Expense', label: 'Expenses' }, { value: 'Income', label: 'Income' }];
  readonly ranges = [{ value: 'today', label: 'Today' }, { value: 'week', label: 'This week' }, { value: 'month', label: 'This month' }, { value: 'year', label: 'This year' }, { value: 'clear', label: 'All time' }];
  readonly granularities = [{ value: 'day', label: 'Daily' }, { value: 'week', label: 'Weekly' }, { value: 'month', label: 'Monthly' }, { value: 'year', label: 'Yearly' }];

  readonly type = signal('all');
  readonly granularity = signal('month');
  readonly items = signal<Transaction[] | null>(null);
  readonly summary = signal<ExpenseSummary | null>(null);
  readonly periods = signal<PeriodBucket[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly accounts = signal<Account[]>([]);
  readonly methods = signal<string[]>([]);
  readonly drawerOpen = signal(false);
  readonly editing = signal<Transaction | null>(null);
  readonly busy = signal(false);
  readonly formType = signal<TransactionType>('Expense');

  search = ''; categoryId = ''; accountId = ''; paymentMethod = ''; from = ''; to = '';
  form: TransactionRequest = this.blank('Expense');
  private file: File | null = null;

  readonly filterCategories = computed(() => this.categories().filter(c => this.type() === 'all' || c.kind === this.type()));
  readonly formCategories = computed(() => this.categories().filter(c => c.kind === this.formType()));
  readonly periodLabels = computed(() => this.periods().map(p => p.label));
  readonly periodSeries = computed(() => [
    { label: 'Income', values: this.periods().map(p => p.income), color: '#14b8a6' },
    { label: 'Expenses', values: this.periods().map(p => p.expenses), color: '#ec4899' }
  ]);

  ngOnInit() {
    if (this.typeParam()) this.type.set(this.typeParam()!);
    this.api.categories().subscribe(list => this.categories.set(list));
    this.api.accounts().subscribe(list => this.accounts.set(list.filter(a => !a.isArchived)));
    this.api.settings().subscribe(s => this.methods.set(s.paymentMethods));
    this.reload();
    this.loadPeriods();
  }

  private query() {
    return { type: this.type(), categoryId: this.categoryId, accountId: this.accountId, paymentMethod: this.paymentMethod, from: this.from, to: this.to, search: this.search };
  }

  reload() {
    this.api.transactions(this.query()).subscribe(list => this.items.set(list));
    this.api.expenseSummary(this.query()).subscribe(s => this.summary.set(s));
  }

  loadPeriods() { this.api.periods(this.granularity()).subscribe(list => this.periods.set(list)); }
  exportUrl() { return this.api.exportUrl(this.query()); }
  setType(value: string) { this.type.set(value); this.categoryId = ''; this.reload(); }
  setGranularity(value: string) { this.granularity.set(value); this.loadPeriods(); }

  setRange(range: string) {
    const now = new Date();
    const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    this.to = range === 'clear' ? '' : today();
    if (range === 'today') this.from = today();
    else if (range === 'week') { const d = new Date(now); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); this.from = iso(d); }
    else if (range === 'month') this.from = iso(new Date(now.getFullYear(), now.getMonth(), 1));
    else if (range === 'year') this.from = iso(new Date(now.getFullYear(), 0, 1));
    else this.from = '';
    this.reload();
  }

  blank(type: TransactionType): TransactionRequest {
    return { type, amount: null, date: today(), categoryId: null, description: '', paymentMethod: null, accountId: null, merchant: null, notes: null, isRecurring: false, frequency: 'Monthly' };
  }

  setFormType(type: TransactionType) {
    this.form.type = type;
    this.formType.set(type);
    this.form.categoryId = this.formCategories()[0]?.id ?? null;
  }

  isTransferCategory() { return this.categories().find(c => c.id === this.form.categoryId)?.excludeFromTotals ?? false; }

  openForm(item?: Transaction) {
    this.editing.set(item ?? null);
    this.file = null;
    if (item) {
      this.formType.set(item.type);
      this.form = { type: item.type, amount: item.amount, date: item.date, categoryId: item.categoryId, description: item.description, paymentMethod: item.paymentMethod,
        accountId: item.accountId, merchant: item.merchant, notes: item.notes, isRecurring: item.isRecurring, frequency: null };
    } else {
      const type: TransactionType = this.type() === 'Income' ? 'Income' : 'Expense';
      this.form = this.blank(type);
      this.setFormType(type);
    }
    this.drawerOpen.set(true);
  }

  pickFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    if (file && file.size > 5 * 1024 * 1024) { this.toast.error('Receipt must be 5 MB or smaller.'); (event.target as HTMLInputElement).value = ''; return; }
    this.file = file;
  }

  save() {
    if (!this.form.amount || this.form.amount <= 0 || !this.form.categoryId || !this.form.description.trim()) { this.toast.error('Amount, category and description are required.'); return; }
    this.busy.set(true);
    const id = this.editing()?.id;
    const body = { ...this.form, frequency: this.form.isRecurring ? this.form.frequency : null };
    (id ? this.api.updateTransaction(id, body) : this.api.createTransaction(body)).subscribe({
      next: saved => {
        if (this.file) this.api.uploadAttachment('transaction', saved.id, this.file).subscribe();
        this.busy.set(false); this.drawerOpen.set(false);
        this.toast.success(id ? 'Transaction updated' : 'Transaction added');
        this.reload(); this.loadPeriods();
      },
      error: () => this.busy.set(false)
    });
  }

  async remove(item: Transaction) {
    const extra = item.isBillPayment ? ' The linked bill payment will be removed too.' : '';
    if (!await this.confirm.ask('Delete transaction?', `${item.description} · ${this.prefs.money(item.amount)}.${extra} This can't be undone.`)) return;
    this.api.deleteTransaction(item.id).subscribe(() => { this.toast.success('Transaction deleted'); this.reload(); this.loadPeriods(); });
  }
}
