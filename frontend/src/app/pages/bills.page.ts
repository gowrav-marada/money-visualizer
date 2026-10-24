import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { Account, BILL_TYPES, Bill, BillRequest, BillSummary, Category, EmailImport, EmailStatus, billTypeLabel, today } from '../core/models';
import { PreferencesService } from '../core/preferences.service';
import { ConfirmService, ToastService } from '../core/toast.service';
import { DrawerComponent } from '../shared/drawer.component';
import { IconComponent } from '../shared/icon.component';
import { EmptyStateComponent, SkeletonComponent, StatusPillComponent } from '../shared/ui';

type Mode = 'form' | 'pay' | 'review' | null;

@Component({
  selector: 'mv-bills',
  imports: [FormsModule, IconComponent, DrawerComponent, StatusPillComponent, SkeletonComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-head">
      <div><h1>Bills</h1><p>Card statements, utilities, subscriptions and more.</p></div>
      <div class="actions hide-mobile"><button class="btn" type="button" (click)="openForm()"><mv-icon name="plus" /> Add bill</button></div>
    </div>

    <div class="segmented">
      <button type="button" [class.active]="tab() === 'bills'" (click)="tab.set('bills')">My bills</button>
      <button type="button" [class.active]="tab() === 'providers'" (click)="tab.set('providers')">By provider</button>
      <button type="button" [class.active]="tab() === 'email'" (click)="openEmail()">From email @if (reviewCount()) { <span class="pill violet" style="margin-left:6px">{{ reviewCount() }}</span> }</button>
    </div>

    @if (tab() !== 'email') {
      @if (summary(); as s) {
        <div class="grid-cards">
          <button type="button" class="stat hero" (click)="setStatus('unpaid')"><span class="label"><span class="chip-icon"><mv-icon name="bill" [size]="17" /></span>Total unpaid</span><span class="value">{{ prefs.money(s.unpaid.amount) }}</span><span class="hint">{{ s.unpaid.count }} bill(s)</span></button>
          <button type="button" class="stat tone-amber" (click)="setStatus('DueSoon')"><span class="label"><span class="chip-icon"><mv-icon name="clock" [size]="17" /></span>Due this week</span><span class="value">{{ prefs.money(s.dueThisWeek.amount) }}</span><span class="hint">{{ s.dueThisWeek.count }} bill(s)</span></button>
          <button type="button" class="stat tone-blue" (click)="setStatus('Upcoming')"><span class="label"><span class="chip-icon"><mv-icon name="info" [size]="17" /></span>Due this month</span><span class="value">{{ prefs.money(s.dueThisMonth.amount) }}</span><span class="hint">{{ s.dueThisMonth.count }} bill(s)</span></button>
          <button type="button" class="stat tone-red" (click)="setStatus('Overdue')"><span class="label"><span class="chip-icon"><mv-icon name="alert" [size]="17" /></span>Overdue</span><span class="value">{{ prefs.money(s.overdue.amount) }}</span><span class="hint">{{ s.overdue.count }} bill(s)</span></button>
          <button type="button" class="stat tone-green" (click)="setStatus('Paid')"><span class="label"><span class="chip-icon"><mv-icon name="check" [size]="17" /></span>Paid this month</span><span class="value">{{ prefs.money(s.paidThisMonth.amount) }}</span><span class="hint">{{ s.paidThisMonth.count }} bill(s)</span></button>
          <button type="button" class="stat tone-violet" (click)="toggleRecurring()"><span class="label"><span class="chip-icon"><mv-icon name="sync" [size]="17" /></span>Recurring</span><span class="value">{{ s.recurring }}</span><span class="hint">Repeating bills</span></button>
        </div>
      }
    }

    @if (tab() === 'bills') {
      <div class="toolbar">
        <label class="search"><mv-icon name="search" [size]="18" /><input [(ngModel)]="search" (ngModelChange)="reload()" placeholder="Search provider or account" /></label>
        <select class="input compact" [(ngModel)]="billType" (change)="reload()" aria-label="Bill type"><option value="">All types</option>@for (t of billTypes; track t.value) { <option [value]="t.value">{{ t.label }}</option> }</select>
      </div>
      <div class="chips">
        @for (st of statuses; track st.value) { <button type="button" class="chip" [class.active]="status() === st.value" (click)="setStatus(st.value)">{{ st.label }}</button> }
        @if (recurringOnly()) { <button type="button" class="chip active" (click)="toggleRecurring()">Recurring ✕</button> }
      </div>

      @if (bills(); as list) {
        @if (list.length) {
          <div class="bill-grid">
            @for (b of list; track b.id) {
              <article class="bill-card" [class]="'bill-card s-' + b.status">
                <div class="bc-top">
                  <span class="dot-icon">{{ emoji(b.billType) }}</span>
                  <div style="flex:1;min-width:0"><b>{{ b.provider }}</b><span class="sub">{{ billTypeLabel(b.billType) }} {{ b.accountIdentifier ? '· ' + b.accountIdentifier : '' }} @if (b.fromEmail) { · ✉️ }</span></div>
                  <mv-status [status]="b.status" />
                </div>
                <div class="bc-amount">
                  <span class="num">{{ prefs.money(b.unpaid > 0 ? b.unpaid : b.amount) }}</span>
                  <span class="muted">{{ b.status === 'Paid' ? 'Paid ' + prefs.date(b.paymentDate) : dueText(b) }}</span>
                </div>
                @if (b.paidAmount > 0 && b.unpaid > 0) {
                  <div class="progress"><span [style.width.%]="(b.paidAmount / b.amount) * 100"></span></div>
                  <span class="sub">{{ prefs.money(b.paidAmount) }} of {{ prefs.money(b.amount) }} paid</span>
                }
                <span class="sub">
                  @if (b.minimumDue) { Min due {{ prefs.money(b.minimumDue) }} · }
                  @if (b.periodStart) { {{ prefs.date(b.periodStart) }} – {{ prefs.date(b.periodEnd) }} · }
                  @if (b.isRecurring) { 🔁 Recurring }
                </span>
                <div class="bc-actions">
                  @if (b.unpaid > 0 && b.status !== 'Ignored') { <button class="btn small success" type="button" (click)="openPay(b)">Pay</button> }
                  <button class="btn small ghost" type="button" (click)="toggleIgnore(b)">{{ b.status === 'Ignored' ? 'Restore' : 'Ignore' }}</button>
                  <span class="spacer"></span>
                  <button class="icon-btn" type="button" title="Edit" (click)="openForm(b)"><mv-icon name="edit" [size]="18" /></button>
                  <button class="icon-btn danger" type="button" title="Delete" (click)="remove(b)"><mv-icon name="trash" [size]="18" /></button>
                </div>
              </article>
            }
          </div>
        } @else {
          <mv-empty emoji="📬" title="No bills here" message="Add bills manually or import them from your email.">
            <button class="btn" type="button" (click)="openForm()">Add a bill</button>
          </mv-empty>
        }
      } @else { <mv-skeleton [cardCount]="6" [rowCount]="0" /> }
    }

    @if (tab() === 'providers') {
      <div class="panel">
        @for (g of providers(); track g.provider) {
          <div class="list-item">
            <span class="dot-icon" style="background:var(--brand-soft);color:var(--brand)">{{ g.provider.charAt(0) }}</span>
            <span class="grow"><span class="title">{{ g.provider }}</span><span class="sub">{{ g.count }} bill(s) · next due {{ prefs.date(g.nextDue) }}</span></span>
            <span class="amount">{{ prefs.money(g.unpaid) }}</span>
          </div>
        } @empty { <p class="muted">No bills yet.</p> }
      </div>
    }

    @if (tab() === 'email') {
      @if (emailStatus(); as es) {
        <div class="grid-2">
          @for (p of mailProviders; track p.id) {
            <section class="panel">
              <div class="panel-head"><span class="dot-icon" [style.background]="p.bg" style="color:#fff">{{ p.letter }}</span><div><h2>{{ p.label }}</h2><span class="sub">{{ p.scope }}</span></div></div>
              @if (connection(p.id); as c) {
                <p style="margin:0 0 4px"><b>{{ c.emailAddress }}</b></p>
                <p class="muted" style="margin:0 0 12px;font-size:13px">Last synced: {{ c.lastSyncedAt ? prefs.date(c.lastSyncedAt) + ' ' + time(c.lastSyncedAt) : 'never' }}</p>
                <div class="row-end" style="justify-content:flex-start">
                  <button class="btn small" type="button" [disabled]="syncing()" (click)="sync()">@if (syncing()) { <span class="spinner"></span> } @else { <mv-icon name="sync" [size]="16" /> } Sync now</button>
                  <button class="btn small ghost" type="button" (click)="disconnect(p.id)">Disconnect</button>
                </div>
              } @else if (p.id === 'Outlook' ? es.outlookConfigured : es.gmailConfigured) {
                <p class="muted" style="font-size:13px;margin:0 0 12px">Read-only access. We never send, modify or delete your email.</p>
                <a class="btn small" [href]="'/api/email/connect/' + p.id">Connect {{ p.label }}</a>
              } @else {
                <p class="muted" style="font-size:13px;margin:0">Not configured. Add the {{ p.label }} OAuth client ID in the backend settings (see README).</p>
              }
            </section>
          }
        </div>
        <div class="note-box" style="margin-bottom:14px">Only emails still in your connected mailbox can be read — permanently deleted emails can't be recovered. You can always add a bill manually.</div>
      }

      <div class="chips">
        @for (st of importStatuses; track st.value) {
          <button type="button" class="chip" [class.active]="importStatus() === st.value" (click)="setImportStatus(st.value)">{{ st.label }} @if (count(st.value)) { ({{ count(st.value) }}) }</button>
        }
      </div>

      @if (imports(); as list) {
        <div class="cards-grid">
          @for (m of list; track m.id) {
            <article class="m-card">
              <div class="top">
                <span class="dot-icon" style="background:var(--brand-soft);color:var(--brand)"><mv-icon name="mail" [size]="18" /></span>
                <span style="flex:1;min-width:0"><b>{{ m.providerName || m.fromAddress }}</b><span class="sub">{{ m.subject }}</span></span>
                <mv-status [status]="m.status" />
              </div>
              <div class="top" style="flex-wrap:wrap;gap:6px">
                @if (m.amount !== null) { <b class="num">{{ prefs.money(m.amount) }}</b> }
                @if (m.dueDate) { <span class="muted">· due {{ prefs.date(m.dueDate) }}</span> }
                @if (m.billType) { <span class="pill blue">{{ billTypeLabel(m.billType) }}</span> }
                @if (m.isLowConfidence) { <span class="pill amber">Low confidence {{ Math.round(m.confidence * 100) }}%</span> }
                @if (m.looksLikePayment) { <span class="pill green">Payment email</span> }
              </div>
              @if (m.failureReason) { <span class="sub" style="color:var(--red)">{{ m.failureReason }}</span> }
              <span class="sub">Received {{ prefs.date(m.receivedAt) }} via {{ m.provider }} @if (m.attachmentName) { · 📎 {{ m.attachmentName }} }</span>
              <div class="bottom">
                @if (m.status === 'Detected' || m.status === 'Duplicate' || m.status === 'Failed') {
                  <button class="btn small" type="button" (click)="review(m)">Review & save</button>
                  <button class="btn small ghost" type="button" (click)="ignoreImport(m)">Ignore</button>
                }
                @if (m.status === 'Ignored') { <button class="btn small ghost" type="button" (click)="restoreImport(m)">Restore</button> }
              </div>
            </article>
          } @empty {
            <mv-empty emoji="📭" title="No emails here" message="Connect a mailbox and press Sync now to detect bills." />
          }
        </div>
      } @else { <mv-skeleton [cardCount]="0" [rowCount]="3" /> }
    }

    <button class="fab" type="button" aria-label="Add bill" (click)="openForm()"><mv-icon name="plus" [size]="26" /></button>

    <mv-drawer [open]="mode() === 'form' || mode() === 'review'" [title]="mode() === 'review' ? 'Review detected bill' : editing() ? 'Edit bill' : 'New bill'" (closed)="close()">
      <form class="form" (ngSubmit)="saveBill()" #f="ngForm">
        @if (mode() === 'review' && reviewing(); as m) {
          <div class="note-box" [class.warn]="m.isLowConfidence">
            {{ m.isLowConfidence ? '⚠️ Low extraction confidence (' + Math.round(m.confidence * 100) + '%). Please check every field.' : 'Extracted from "' + m.subject + '". Check the details before saving.' }}
          </div>
          @if (m.looksLikePayment) { <div class="note-box warn">This looks like a payment confirmation. Saving creates a bill — to mark an existing bill as paid, use Pay on that bill instead.</div> }
        }
        @if (duplicateWarning()) { <div class="note-box warn">{{ duplicateWarning() }} <button class="link-btn" type="button" (click)="form.allowDuplicate = true; saveBill()">Save anyway</button></div> }
        <div class="form-row">
          <label class="field"><span>Provider *</span><input class="input" name="prov" [(ngModel)]="form.provider" required maxlength="100" placeholder="HDFC Bank, Airtel…" /></label>
          <label class="field"><span>Bill type *</span><select class="input" name="type" [(ngModel)]="form.billType">@for (t of billTypes; track t.value) { <option [ngValue]="t.value">{{ t.label }}</option> }</select></label>
        </div>
        <label class="field"><span>Account / card (last 4 digits are kept)</span><input class="input" name="acct" [(ngModel)]="form.accountIdentifier" placeholder="XXXX1234" /></label>
        <div class="form-row">
          <label class="field"><span>Bill amount *</span><input class="input" type="number" name="amt" [(ngModel)]="form.amount" required min="0.01" step="0.01" /></label>
          <label class="field"><span>Minimum due</span><input class="input" type="number" name="min" [(ngModel)]="form.minimumDue" min="0" step="0.01" /></label>
        </div>
        <label class="field"><span>Due date *</span><input class="input" type="date" name="due" [(ngModel)]="form.dueDate" required /></label>
        <div class="form-row">
          <label class="field"><span>Period from</span><input class="input" type="date" name="ps" [(ngModel)]="form.periodStart" /></label>
          <label class="field"><span>Period to</span><input class="input" type="date" name="pe" [(ngModel)]="form.periodEnd" /></label>
        </div>
        <label class="field"><span>Usual payment method</span><select class="input" name="pm" [(ngModel)]="form.paymentMethod"><option [ngValue]="null">—</option>@for (m of methods(); track m) { <option [ngValue]="m">{{ m }}</option> }</select></label>
        <label class="check"><input type="checkbox" name="rec" [(ngModel)]="form.isRecurring" /> Recurring bill (creates next cycle when paid)</label>
        <label class="field"><span>Notes</span><textarea class="input" name="notes" [(ngModel)]="form.notes"></textarea></label>
        @if (mode() === 'form') { <label class="field"><span>Attachment (PDF/image)</span><input class="input" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" (change)="pickFile($event)" /></label> }
        <div class="form-actions"><button class="btn ghost" type="button" (click)="close()">Cancel</button><button class="btn" type="submit" [disabled]="busy() || f.invalid">{{ mode() === 'review' ? 'Confirm & save' : 'Save' }}</button></div>
      </form>
    </mv-drawer>

    <mv-drawer [open]="mode() === 'pay'" title="Pay bill" (closed)="close()">
      @if (selected(); as b) {
        <form class="form" (ngSubmit)="pay()">
          <div class="note-box">{{ b.provider }} · unpaid {{ prefs.money(b.unpaid) }} @if (b.minimumDue) { · min {{ prefs.money(b.minimumDue) }} }</div>
          <div class="chips" style="margin:0">
            <button type="button" class="chip" (click)="payForm.amount = b.unpaid">Full {{ prefs.money(b.unpaid) }}</button>
            @if (b.minimumDue && b.minimumDue < b.unpaid) { <button type="button" class="chip" (click)="payForm.amount = b.minimumDue">Minimum</button> }
          </div>
          <div class="form-row">
            <label class="field"><span>Amount *</span><input class="input" type="number" name="pamt" [(ngModel)]="payForm.amount" required min="0.01" [max]="b.unpaid" step="0.01" /></label>
            <label class="field"><span>Paid on</span><input class="input" type="date" name="pdate" [(ngModel)]="payForm.date" /></label>
          </div>
          <label class="field"><span>Payment method</span><select class="input" name="pm2" [(ngModel)]="payForm.paymentMethod"><option [ngValue]="null">—</option>@for (m of methods(); track m) { <option [ngValue]="m">{{ m }}</option> }</select></label>
          <label class="field"><span>Paid from account</span><select class="input" name="pacct" [(ngModel)]="payForm.accountId"><option [ngValue]="null">—</option>@for (a of accounts(); track a.id) { <option [ngValue]="a.id">{{ a.name }}</option> }</select></label>
          <label class="check"><input type="checkbox" name="rae" [(ngModel)]="payForm.recordAsExpense" /> Also record in Expenses</label>
          @if (payForm.recordAsExpense) {
            @if (b.billType === 'CreditCard') {
              <div class="note-box warn">Saved as a "Credit-card payment" transfer — not counted as a new expense, since your card purchases are already tracked.</div>
            } @else {
              <label class="field"><span>Expense category</span><select class="input" name="pcat" [(ngModel)]="payForm.categoryId"><option [ngValue]="null">Automatic</option>@for (c of expenseCategories(); track c.id) { <option [ngValue]="c.id">{{ c.name }}</option> }</select></label>
            }
          }
          <div class="form-actions"><button class="btn ghost" type="button" (click)="close()">Cancel</button><button class="btn success" type="submit" [disabled]="busy() || !payForm.amount || payForm.amount > b.unpaid">Save payment</button></div>
        </form>
      }
    </mv-drawer>
  `,
  styles: [`
    .bill-grid, .cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 14px; }
    .bill-card { background: var(--surface); border: 1px solid var(--line); border-left: 5px solid var(--blue); border-radius: 18px; padding: 16px; display: grid; gap: 10px; box-shadow: var(--shadow); }
    .bill-card.s-Paid { border-left-color: var(--green); } .bill-card.s-DueSoon { border-left-color: var(--amber); }
    .bill-card.s-Overdue { border-left-color: var(--red); } .bill-card.s-Ignored { border-left-color: var(--gray); opacity: .75; }
    .bc-top { display: flex; align-items: center; gap: 10px; }
    .bc-top .dot-icon { background: var(--surface-2); font-size: 18px; }
    .bc-amount { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
    .bc-amount .num { font-size: 24px; font-weight: 800; letter-spacing: -.02em; }
    .bc-amount .muted { font-size: 13px; font-weight: 600; }
    .bc-actions { display: flex; align-items: center; gap: 6px; }
  `]
})
export class BillsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  readonly prefs = inject(PreferencesService);
  readonly statusParam = input<string | undefined>(undefined, { alias: 'status' });
  readonly tabParam = input<string | undefined>(undefined, { alias: 'tab' });
  readonly connectedParam = input<string | undefined>(undefined, { alias: 'connected' });
  readonly errorParam = input<string | undefined>(undefined, { alias: 'error' });

  readonly Math = Math;
  readonly billTypes = BILL_TYPES;
  readonly billTypeLabel = billTypeLabel;
  readonly statuses = [{ value: 'all', label: 'All' }, { value: 'unpaid', label: 'Unpaid' }, { value: 'Upcoming', label: 'Upcoming' }, { value: 'DueSoon', label: 'Due soon' }, { value: 'Overdue', label: 'Overdue' }, { value: 'Paid', label: 'Paid' }, { value: 'Ignored', label: 'Ignored' }];
  readonly importStatuses = [{ value: 'Detected', label: 'Detected' }, { value: 'Confirmed', label: 'Confirmed' }, { value: 'Duplicate', label: 'Duplicates' }, { value: 'Failed', label: 'Failed' }, { value: 'Ignored', label: 'Ignored' }, { value: 'all', label: 'Import history' }];
  readonly mailProviders = [
    { id: 'Gmail', label: 'Gmail', letter: 'G', bg: 'linear-gradient(135deg,#ea4335,#fbbc05)', scope: 'gmail.readonly' },
    { id: 'Outlook', label: 'Outlook', letter: 'O', bg: 'linear-gradient(135deg,#0078d4,#28a8ea)', scope: 'Mail.Read (Microsoft Graph)' }
  ];

  readonly tab = signal<'bills' | 'providers' | 'email'>('bills');
  readonly status = signal('all');
  readonly recurringOnly = signal(false);
  readonly bills = signal<Bill[] | null>(null);
  readonly allBills = signal<Bill[]>([]);
  readonly summary = signal<BillSummary | null>(null);
  readonly methods = signal<string[]>([]);
  readonly accounts = signal<Account[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly emailStatus = signal<EmailStatus | null>(null);
  readonly imports = signal<EmailImport[] | null>(null);
  readonly importStatus = signal('Detected');
  readonly mode = signal<Mode>(null);
  readonly editing = signal<Bill | null>(null);
  readonly selected = signal<Bill | null>(null);
  readonly reviewing = signal<EmailImport | null>(null);
  readonly busy = signal(false);
  readonly syncing = signal(false);
  readonly duplicateWarning = signal('');

  search = ''; billType = '';
  form: BillRequest = this.blank();
  payForm = { amount: null as number | null, date: today(), paymentMethod: null as string | null, recordAsExpense: true, categoryId: null as string | null, accountId: null as string | null };
  private file: File | null = null;

  readonly expenseCategories = computed(() => this.categories().filter(c => c.kind === 'Expense' && !c.excludeFromTotals));
  readonly reviewCount = computed(() => this.emailStatus()?.counts?.Detected ?? 0);
  readonly providers = computed(() => {
    const groups = new Map<string, { provider: string; count: number; unpaid: number; nextDue: string | null }>();
    for (const bill of this.allBills()) {
      const g = groups.get(bill.provider) ?? { provider: bill.provider, count: 0, unpaid: 0, nextDue: null };
      g.count++;
      if (bill.status !== 'Ignored') g.unpaid += bill.unpaid;
      if (bill.unpaid > 0 && bill.status !== 'Ignored' && (!g.nextDue || bill.dueDate < g.nextDue)) g.nextDue = bill.dueDate;
      groups.set(bill.provider, g);
    }
    return [...groups.values()].sort((a, b) => b.unpaid - a.unpaid);
  });

  ngOnInit() {
    if (this.statusParam()) this.status.set(this.statusParam()!);
    this.api.settings().subscribe(s => this.methods.set(s.paymentMethods));
    this.api.accounts().subscribe(list => this.accounts.set(list.filter(a => !a.isArchived)));
    this.api.categories().subscribe(list => this.categories.set(list));
    this.refresh();
    this.loadEmailStatus();
    if (this.tabParam() === 'email') this.openEmail();
    if (this.connectedParam()) this.toast.success(`${this.connectedParam()} connected. Press Sync now to find bills.`);
    if (this.errorParam()) this.toast.error(`Email connection failed: ${this.errorParam()}`);
  }

  refresh() {
    this.reload();
    this.api.billSummary().subscribe(s => this.summary.set(s));
    this.api.bills({}).subscribe(list => this.allBills.set(list));
  }

  reload() {
    const status = this.status();
    this.api.bills({ status: status === 'unpaid' ? null : status, billType: this.billType, search: this.search, recurring: this.recurringOnly() || null })
      .subscribe(list => this.bills.set(status === 'unpaid' ? list.filter(b => b.unpaid > 0 && b.status !== 'Ignored') : list));
  }

  setStatus(value: string) { this.status.set(value); this.tab.set('bills'); this.reload(); }
  toggleRecurring() { this.recurringOnly.update(v => !v); this.tab.set('bills'); this.reload(); }

  emoji(type: string) {
    return ({ CreditCard: '💳', Telephone: '📱', Internet: '🌐', Electricity: '⚡', Water: '💧', Insurance: '🛡️', Emi: '🏦', Rent: '🏠', Subscription: '🎬' } as Record<string, string>)[type] ?? '🧾';
  }

  dueText(bill: Bill) {
    if (bill.status === 'Ignored') return 'Ignored';
    const d = bill.daysUntilDue;
    if (d === 0) return 'Due today';
    if (d === 1) return 'Due tomorrow';
    return d > 0 ? `Due in ${d} days` : `${-d} days overdue`;
  }

  time(value: string) { return new Date(value).toLocaleTimeString(this.prefs.locale(), { hour: '2-digit', minute: '2-digit' }); }

  blank(): BillRequest {
    return { provider: '', billType: 'CreditCard', accountIdentifier: null, amount: null, minimumDue: null, dueDate: today(), periodStart: null, periodEnd: null, isRecurring: true, paymentMethod: null, emailSource: null, notes: null };
  }

  openForm(bill?: Bill) {
    this.duplicateWarning.set('');
    this.file = null;
    this.editing.set(bill ?? null);
    this.form = bill ? {
      provider: bill.provider, billType: bill.billType, accountIdentifier: bill.accountIdentifier, amount: bill.amount, minimumDue: bill.minimumDue,
      dueDate: bill.dueDate, periodStart: bill.periodStart, periodEnd: bill.periodEnd, isRecurring: bill.isRecurring,
      paymentMethod: bill.paymentMethod, emailSource: bill.emailSource, notes: bill.notes
    } : this.blank();
    this.mode.set('form');
  }

  review(item: EmailImport) {
    this.duplicateWarning.set(item.status === 'Duplicate' ? 'A bill with the same provider, account, period, amount and due date already exists.' : '');
    this.editing.set(null);
    this.reviewing.set(item);
    this.form = {
      provider: item.providerName ?? '', billType: item.billType ?? 'Other', accountIdentifier: item.maskedAccount, amount: item.amount,
      minimumDue: item.minimumDue, dueDate: item.dueDate ?? today(), periodStart: item.periodStart, periodEnd: item.periodEnd,
      isRecurring: true, paymentMethod: null, emailSource: item.subject, notes: null
    };
    this.mode.set('review');
  }

  close() { this.mode.set(null); this.reviewing.set(null); }

  pickFile(event: Event) { this.file = (event.target as HTMLInputElement).files?.[0] ?? null; }

  saveBill() {
    if (!this.form.provider.trim() || !this.form.amount || this.form.amount <= 0 || !this.form.dueDate) { this.toast.error('Provider, amount and due date are required.'); return; }
    if (this.form.minimumDue && this.form.minimumDue > this.form.amount) { this.toast.error('Minimum due cannot be more than the bill amount.'); return; }
    this.busy.set(true);
    const reviewing = this.reviewing();
    const id = this.editing()?.id;
    const call = reviewing ? this.api.confirmImport(reviewing.id, this.form) : id ? this.api.updateBill(id, this.form) : this.api.createBill(this.form);
    call.subscribe({
      next: saved => {
        if (this.file && !reviewing) this.api.uploadAttachment('bill', saved.id, this.file).subscribe();
        this.busy.set(false); this.close();
        this.toast.success(reviewing ? 'Bill confirmed and saved' : id ? 'Bill updated' : 'Bill added');
        this.refresh();
        if (reviewing) { this.loadImports(); this.loadEmailStatus(); }
      },
      error: (error: HttpErrorResponse) => {
        this.busy.set(false);
        if (error.status === 409) this.duplicateWarning.set(error.error?.detail ?? 'This bill looks like a duplicate of an existing bill.');
      }
    });
  }

  openPay(bill: Bill) {
    this.selected.set(bill);
    this.payForm = { amount: bill.unpaid, date: today(), paymentMethod: bill.paymentMethod, recordAsExpense: true, categoryId: null, accountId: null };
    this.mode.set('pay');
  }

  pay() {
    const bill = this.selected();
    if (!bill || !this.payForm.amount) return;
    this.busy.set(true);
    this.api.payBill(bill.id, { ...this.payForm, amount: this.payForm.amount }).subscribe({
      next: updated => { this.busy.set(false); this.close(); this.toast.success(updated.unpaid > 0 ? `Payment saved · ${this.prefs.money(updated.unpaid)} left` : 'Bill paid ✅'); this.refresh(); },
      error: () => this.busy.set(false)
    });
  }

  toggleIgnore(bill: Bill) {
    this.api.ignoreBill(bill.id, bill.status !== 'Ignored').subscribe(() => { this.toast.success(bill.status === 'Ignored' ? 'Bill restored' : 'Bill ignored'); this.refresh(); });
  }

  async remove(bill: Bill) {
    const extra = bill.payments.some(p => p.personalTransactionId) ? ' Linked expense entries will also be removed.' : '';
    if (!await this.confirm.ask('Delete bill?', `${bill.provider} · ${this.prefs.money(bill.amount)}.${extra} This can't be undone.`)) return;
    this.api.deleteBill(bill.id).subscribe(() => { this.toast.success('Bill deleted'); this.refresh(); });
  }

  openEmail() { this.tab.set('email'); this.loadImports(); }
  loadEmailStatus() { this.api.emailStatus().subscribe(s => this.emailStatus.set(s)); }
  loadImports() { this.imports.set(null); this.api.emailImports(this.importStatus()).subscribe(list => this.imports.set(list)); }
  setImportStatus(value: string) { this.importStatus.set(value); this.loadImports(); }
  count(status: string) { return status === 'all' ? 0 : (this.emailStatus()?.counts as Record<string, number> | undefined)?.[status] ?? 0; }
  connection(provider: string) { return this.emailStatus()?.connections.find(c => c.provider === provider) ?? null; }

  sync() {
    this.syncing.set(true);
    this.api.syncEmail().subscribe({
      next: r => {
        this.syncing.set(false);
        this.toast.success(`Scanned ${r.scanned} emails · ${r.detected} new bill(s) · ${r.duplicates} duplicate(s) · ${r.failed} failed`);
        this.loadEmailStatus(); this.loadImports();
      },
      error: () => this.syncing.set(false)
    });
  }

  async disconnect(provider: string) {
    if (!await this.confirm.ask(`Disconnect ${provider}?`, 'Access will be revoked. Bills you already confirmed are kept.', 'Disconnect')) return;
    const deleteImports = await this.confirm.ask('Delete imported email data?', 'Remove the detected/ignored email records too? Confirmed bills stay.', 'Delete data');
    this.api.disconnectEmail(provider, deleteImports).subscribe(() => { this.toast.success(`${provider} disconnected`); this.loadEmailStatus(); this.loadImports(); });
  }

  ignoreImport(item: EmailImport) { this.api.ignoreImport(item.id).subscribe(() => { this.loadImports(); this.loadEmailStatus(); }); }
  restoreImport(item: EmailImport) { this.api.restoreImport(item.id).subscribe(() => { this.loadImports(); this.loadEmailStatus(); }); }
}
