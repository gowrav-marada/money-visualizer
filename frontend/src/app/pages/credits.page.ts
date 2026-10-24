import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ApiService } from '../core/api.service';
import { Credit, CreditRequest, CreditSummary, HistoryEntry, PersonBalance, today } from '../core/models';
import { PreferencesService } from '../core/preferences.service';
import { ConfirmService, ToastService } from '../core/toast.service';
import { DrawerComponent } from '../shared/drawer.component';
import { IconComponent } from '../shared/icon.component';
import { EmptyStateComponent, SkeletonComponent, StatusPillComponent } from '../shared/ui';

type Mode = 'form' | 'settle' | 'history' | 'reminder' | null;

@Component({
  selector: 'mv-credits',
  imports: [FormsModule, IconComponent, DrawerComponent, StatusPillComponent, SkeletonComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-head">
      <div><h1>Credits & Debits</h1><p>Money between you and other people.</p></div>
      <div class="actions hide-mobile"><button class="btn" type="button" (click)="openForm()"><mv-icon name="plus" /> Add record</button></div>
    </div>

    @if (summary(); as s) {
      <div class="grid-cards">
        <button type="button" class="stat tone-green" (click)="setDirection('Receive')"><span class="label"><span class="chip-icon"><mv-icon name="arrowIn" [size]="17" /></span>To receive</span><span class="value">{{ prefs.money(s.totalToReceive) }}</span><span class="hint">{{ s.peopleOweMe }} people owe you</span></button>
        <button type="button" class="stat tone-red" (click)="setDirection('Pay')"><span class="label"><span class="chip-icon"><mv-icon name="arrowOut" [size]="17" /></span>To pay</span><span class="value">{{ prefs.money(s.totalToPay) }}</span><span class="hint">You owe {{ s.peopleIOwe }} people</span></button>
        <button type="button" class="stat hero" (click)="setDirection('all')"><span class="label"><span class="chip-icon"><mv-icon name="wallet" [size]="17" /></span>Net receivable</span><span class="value">{{ prefs.money(s.netReceivable) }}</span><span class="hint">To receive − to pay</span></button>
        <button type="button" class="stat tone-teal" (click)="setStatus('Paid')"><span class="label"><span class="chip-icon"><mv-icon name="check" [size]="17" /></span>Settled</span><span class="value">{{ prefs.money(s.totalSettled) }}</span><span class="hint">Payments recorded</span></button>
        <button type="button" class="stat tone-blue" (click)="setStatus('Pending')"><span class="label"><span class="chip-icon"><mv-icon name="clock" [size]="17" /></span>Pending</span><span class="value">{{ prefs.money(s.totalPending) }}</span><span class="hint">Still open</span></button>
        <button type="button" class="stat tone-amber" (click)="setStatus('Overdue')"><span class="label"><span class="chip-icon"><mv-icon name="alert" [size]="17" /></span>Overdue</span><span class="value">{{ prefs.money(s.totalOverdue) }}</span><span class="hint">Past expected date</span></button>
      </div>
    }

    <div class="segmented">
      <button type="button" [class.active]="view() === 'records'" (click)="view.set('records')">Records</button>
      <button type="button" [class.active]="view() === 'people'" (click)="view.set('people')">By person</button>
    </div>

    @if (view() === 'records') {
      <div class="toolbar">
        <label class="search"><mv-icon name="search" [size]="18" /><input [(ngModel)]="search" (ngModelChange)="reload()" placeholder="Search person or description" /></label>
        <input class="input compact" type="date" [(ngModel)]="from" (change)="reload()" aria-label="From date" />
        <input class="input compact" type="date" [(ngModel)]="to" (change)="reload()" aria-label="To date" />
        <input class="input compact" type="number" min="0" [(ngModel)]="minAmount" (change)="reload()" placeholder="Min ₹" style="width:100px" />
        <input class="input compact" type="number" min="0" [(ngModel)]="maxAmount" (change)="reload()" placeholder="Max ₹" style="width:100px" />
      </div>
      <div class="chips">
        @for (d of directions; track d.value) { <button type="button" class="chip" [class.active]="direction() === d.value" (click)="setDirection(d.value)">{{ d.label }}</button> }
        <span style="width:8px"></span>
        @for (st of statuses; track st.value) { <button type="button" class="chip" [class.active]="status() === st.value" (click)="setStatus(st.value)">{{ st.label }}</button> }
      </div>

      @if (records(); as list) {
        @if (list.length) {
          <div class="panel table-desktop table-wrap">
            <table class="table">
              <thead><tr><th>Person</th><th>Type</th><th class="right">Amount</th><th class="right">Settled</th><th class="right">Remaining</th><th>Due</th><th>Status</th><th></th></tr></thead>
              <tbody>
                @for (r of list; track r.id) {
                  <tr>
                    <td><b>{{ r.personName }}</b><span class="sub">{{ r.description || '—' }}</span></td>
                    <td><mv-status [status]="r.direction" /></td>
                    <td class="right num">{{ prefs.money(r.amount) }}</td>
                    <td class="right num">{{ prefs.money(r.settledAmount) }}</td>
                    <td class="right num"><b [class.pos]="r.direction === 'Receive'" [class.neg]="r.direction === 'Pay'">{{ prefs.money(r.remaining) }}</b></td>
                    <td>{{ prefs.date(r.expectedDate) }}</td>
                    <td><mv-status [status]="r.status" /></td>
                    <td class="actions-cell">
                      @if (r.remaining > 0) {
                        <button class="icon-btn" type="button" title="Record partial payment" (click)="openSettle(r)"><mv-icon name="wallet" [size]="18" /></button>
                        <button class="icon-btn" type="button" title="Mark as fully paid" (click)="markPaid(r)"><mv-icon name="check" [size]="18" /></button>
                      }
                      <button class="icon-btn" type="button" title="Reminder" (click)="openReminder(r)"><mv-icon name="bell" [size]="18" /></button>
                      <button class="icon-btn" type="button" title="History" (click)="openHistory(r)"><mv-icon name="history" [size]="18" /></button>
                      <button class="icon-btn" type="button" title="Edit" (click)="openForm(r)"><mv-icon name="edit" [size]="18" /></button>
                      <button class="icon-btn danger" type="button" title="Delete" (click)="remove(r)"><mv-icon name="trash" [size]="18" /></button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="cards-mobile">
            @for (r of list; track r.id) {
              <div class="m-card">
                <div class="top">
                  <span class="dot-icon" [style.background]="r.direction === 'Receive' ? 'var(--green-soft)' : 'var(--red-soft)'" [style.color]="r.direction === 'Receive' ? 'var(--green)' : 'var(--red)'">{{ r.personName.charAt(0) }}</span>
                  <span class="grow" style="flex:1;min-width:0"><b>{{ r.personName }}</b><span class="sub">{{ r.description || (r.direction === 'Receive' ? 'Owes you' : 'You owe') }} · due {{ prefs.date(r.expectedDate) }}</span></span>
                  <b class="num" [class.pos]="r.direction === 'Receive'" [class.neg]="r.direction === 'Pay'">{{ prefs.money(r.remaining) }}</b>
                </div>
                <div class="progress"><span [style.width.%]="r.amount ? (r.settledAmount / r.amount) * 100 : 0"></span></div>
                <div class="top"><mv-status [status]="r.status" /><span class="muted" style="font-size:12px">{{ prefs.money(r.settledAmount) }} of {{ prefs.money(r.amount) }} settled</span></div>
                <div class="bottom">
                  @if (r.remaining > 0) {
                    <button class="btn small ghost" type="button" (click)="openSettle(r)">Part pay</button>
                    <button class="btn small success" type="button" (click)="markPaid(r)">Paid</button>
                  }
                  <button class="icon-btn" type="button" aria-label="History" (click)="openHistory(r)"><mv-icon name="history" [size]="18" /></button>
                  <button class="icon-btn" type="button" aria-label="Edit" (click)="openForm(r)"><mv-icon name="edit" [size]="18" /></button>
                  <button class="icon-btn danger" type="button" aria-label="Delete" (click)="remove(r)"><mv-icon name="trash" [size]="18" /></button>
                </div>
              </div>
            }
          </div>
        } @else {
          <mv-empty emoji="🤝" title="No records found" message="Track money you lend or borrow from friends and family.">
            <button class="btn" type="button" (click)="openForm()">Add first record</button>
          </mv-empty>
        }
      } @else { <mv-skeleton [cardCount]="0" [rowCount]="5" /> }
    } @else {
      <div class="panel">
        @for (p of people(); track p.personId) {
          <button type="button" class="list-item person" (click)="filterPerson(p.name)">
            <span class="dot-icon" style="background:var(--brand-soft);color:var(--brand)">{{ p.name.charAt(0) }}</span>
            <span class="grow"><span class="title">{{ p.name }} @if (p.hasOverdue) { <mv-status status="Overdue" /> }</span>
              <span class="sub">Receive {{ prefs.money(p.toReceive) }} · Pay {{ prefs.money(p.toPay) }} · Settled {{ prefs.money(p.settled) }} · Due {{ prefs.date(p.nextDueDate) }} · Active {{ prefs.date(p.latestActivity) }}</span></span>
            <span class="amount" [class.pos]="p.netBalance >= 0" [class.neg]="p.netBalance < 0">{{ prefs.money(p.netBalance) }}</span>
          </button>
        } @empty { <p class="muted">No people yet.</p> }
      </div>
    }

    <button class="fab" type="button" aria-label="Add record" (click)="openForm()"><mv-icon name="plus" [size]="26" /></button>

    <mv-drawer [open]="mode() === 'form'" [title]="editing() ? 'Edit record' : 'New record'" (closed)="close()">
      <form class="form" (ngSubmit)="save()" #f="ngForm">
        <div class="type-toggle">
          <button type="button" class="green" [class.active]="form.direction === 'Receive'" (click)="form.direction = 'Receive'">💰 Money to receive</button>
          <button type="button" class="red" [class.active]="form.direction === 'Pay'" (click)="form.direction = 'Pay'">💸 Money to pay</button>
        </div>
        <label class="field"><span>Person name *</span><input class="input" name="person" [(ngModel)]="form.personName" required list="people-list" maxlength="100" />
          <datalist id="people-list">@for (n of names(); track n) { <option [value]="n"></option> }</datalist></label>
        <div class="form-row">
          <label class="field"><span>Amount *</span><input class="input" type="number" name="amount" [(ngModel)]="form.amount" required min="0.01" step="0.01" /></label>
          <label class="field"><span>Already settled</span><input class="input" type="number" name="settled" [(ngModel)]="form.settledAmount" min="0" step="0.01" [disabled]="!!editing()" /></label>
        </div>
        @if (formRemaining() !== null) { <div class="note-box">Remaining: {{ prefs.money(formRemaining()) }}</div> }
        <div class="form-row">
          <label class="field"><span>Transaction date</span><input class="input" type="date" name="tdate" [(ngModel)]="form.transactionDate" required /></label>
          <label class="field"><span>Expected payment</span><input class="input" type="date" name="edate" [(ngModel)]="form.expectedDate" /></label>
        </div>
        <label class="field"><span>Description</span><input class="input" name="desc" [(ngModel)]="form.description" maxlength="200" /></label>
        <div class="form-row">
          <label class="field"><span>Payment method</span><select class="input" name="method" [(ngModel)]="form.paymentMethod"><option [ngValue]="null">—</option>@for (m of methods(); track m) { <option [ngValue]="m">{{ m }}</option> }</select></label>
          <label class="field"><span>Category</span><input class="input" name="cat" [(ngModel)]="form.category" placeholder="Loan, trip, dinner…" /></label>
        </div>
        <label class="field"><span>Reminder date</span><input class="input" type="date" name="rdate" [(ngModel)]="form.reminderDate" /></label>
        <label class="field"><span>Notes</span><textarea class="input" name="notes" [(ngModel)]="form.notes"></textarea></label>
        @if (error()) { <span class="field"><span class="error">{{ error() }}</span></span> }
        <div class="form-actions"><button class="btn ghost" type="button" (click)="close()">Cancel</button><button class="btn" type="submit" [disabled]="busy() || f.invalid">Save</button></div>
      </form>
    </mv-drawer>

    <mv-drawer [open]="mode() === 'settle'" title="Record payment" (closed)="close()">
      @if (selected(); as r) {
        <form class="form" (ngSubmit)="settle()">
          <div class="note-box">{{ r.personName }} · remaining {{ prefs.money(r.remaining) }} of {{ prefs.money(r.amount) }}</div>
          <div class="form-row">
            <label class="field"><span>Amount *</span><input class="input" type="number" name="samt" [(ngModel)]="settleForm.amount" required min="0.01" [max]="r.remaining" step="0.01" /></label>
            <label class="field"><span>Date</span><input class="input" type="date" name="sdate" [(ngModel)]="settleForm.date" /></label>
          </div>
          <label class="field"><span>Payment method</span><select class="input" name="smethod" [(ngModel)]="settleForm.paymentMethod"><option [ngValue]="null">—</option>@for (m of methods(); track m) { <option [ngValue]="m">{{ m }}</option> }</select></label>
          <label class="field"><span>Notes</span><input class="input" name="snotes" [(ngModel)]="settleForm.notes" /></label>
          @if (settleForm.amount && settleForm.amount > r.remaining) { <span class="error" style="color:var(--red);font-size:13px">Amount can't exceed {{ prefs.money(r.remaining) }}.</span> }
          <div class="form-actions"><button class="btn ghost" type="button" (click)="close()">Cancel</button><button class="btn" type="submit" [disabled]="busy() || !settleForm.amount || settleForm.amount > r.remaining">Save payment</button></div>
        </form>
      }
    </mv-drawer>

    <mv-drawer [open]="mode() === 'reminder'" title="Reminder" (closed)="close()">
      <form class="form" (ngSubmit)="saveReminder()">
        <label class="field"><span>Remind me on</span><input class="input" type="date" name="rem" [(ngModel)]="reminderDate" /></label>
        <div class="form-actions"><button class="btn ghost" type="button" (click)="reminderDate = null; saveReminder()">Clear</button><button class="btn" type="submit">Save</button></div>
      </form>
    </mv-drawer>

    <mv-drawer [open]="mode() === 'history'" title="Transaction history" (closed)="close()">
      <div class="timeline">
        @for (h of history(); track $index) {
          <div class="tl-item"><span class="tl-dot" [class.pay]="h.kind === 'settlement'"></span>
            <div><b>{{ h.description }}</b><span class="sub">{{ prefs.date(h.at) }}</span></div>
            @if (h.amount !== null) { <b class="num">{{ prefs.money(h.amount) }}</b> }
          </div>
        } @empty { <p class="muted">No history.</p> }
      </div>
    </mv-drawer>
  `,
  styles: [`
    .person { width: 100%; border: 0; background: none; text-align: left; }
    .timeline { display: grid; gap: 14px; }
    .tl-item { display: grid; grid-template-columns: 14px 1fr auto; gap: 12px; align-items: start; }
    .tl-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--brand); margin-top: 5px; }
    .tl-dot.pay { background: var(--green); }
  `]
})
export class CreditsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  readonly prefs = inject(PreferencesService);

  readonly directionParam = input<string | undefined>(undefined, { alias: 'direction' });
  readonly personParam = input<string | undefined>(undefined, { alias: 'person' });

  readonly directions = [{ value: 'all', label: 'All' }, { value: 'Receive', label: 'Receive' }, { value: 'Pay', label: 'Pay' }];
  readonly statuses = [{ value: 'all', label: 'Any status' }, { value: 'Pending', label: 'Pending' }, { value: 'PartiallyPaid', label: 'Partially paid' }, { value: 'Paid', label: 'Paid' }, { value: 'Overdue', label: 'Overdue' }];

  readonly view = signal<'records' | 'people'>('records');
  readonly direction = signal('all');
  readonly status = signal('all');
  readonly summary = signal<CreditSummary | null>(null);
  readonly records = signal<Credit[] | null>(null);
  readonly people = signal<PersonBalance[]>([]);
  readonly names = signal<string[]>([]);
  readonly methods = signal<string[]>(['Cash', 'UPI', 'Bank transfer', 'Credit card', 'Debit card']);
  readonly mode = signal<Mode>(null);
  readonly editing = signal<Credit | null>(null);
  readonly selected = signal<Credit | null>(null);
  readonly history = signal<HistoryEntry[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');

  search = '';
  from = '';
  to = '';
  minAmount: number | null = null;
  maxAmount: number | null = null;
  reminderDate: string | null = null;
  form: CreditRequest = this.blank();
  settleForm = { amount: null as number | null, date: today(), paymentMethod: null as string | null, notes: null as string | null };
  formRemaining(): number | null {
    return this.form.amount ? Math.max(0, this.form.amount - (this.form.settledAmount || 0)) : null;
  }

  ngOnInit() {
    if (this.directionParam()) this.direction.set(this.directionParam()!);
    if (this.personParam()) this.search = this.personParam()!;
    this.api.settings().subscribe(s => this.methods.set(s.paymentMethods));
    this.refresh();
  }

  refresh() {
    this.reload();
    forkJoin({ s: this.api.creditSummary(), p: this.api.people(), n: this.api.personNames() }).subscribe(({ s, p, n }) => {
      this.summary.set(s); this.people.set(p); this.names.set(n);
    });
  }

  reload() {
    this.api.credits({ direction: this.direction(), status: this.status(), search: this.search, from: this.from, to: this.to, minAmount: this.minAmount, maxAmount: this.maxAmount })
      .subscribe(list => this.records.set(list));
  }

  setDirection(value: string) { this.direction.set(value); this.view.set('records'); this.reload(); }
  setStatus(value: string) { this.status.set(value); this.view.set('records'); this.reload(); }
  filterPerson(name: string) { this.search = name; this.view.set('records'); this.reload(); }

  blank(): CreditRequest {
    return { personName: '', direction: 'Receive', amount: null, transactionDate: today(), expectedDate: null, description: '', paymentMethod: null, category: null, notes: null, reminderDate: null, settledAmount: 0 };
  }

  openForm(record?: Credit) {
    this.error.set('');
    this.editing.set(record ?? null);
    this.form = record ? {
      personName: record.personName, direction: record.direction, amount: record.amount, transactionDate: record.transactionDate,
      expectedDate: record.expectedDate, description: record.description, paymentMethod: record.paymentMethod, category: record.category,
      notes: record.notes, reminderDate: record.reminderDate, settledAmount: record.settledAmount
    } : this.blank();
    this.mode.set('form');
  }

  openSettle(record: Credit) {
    this.selected.set(record);
    this.settleForm = { amount: record.remaining, date: today(), paymentMethod: record.paymentMethod, notes: null };
    this.mode.set('settle');
  }

  openReminder(record: Credit) { this.selected.set(record); this.reminderDate = record.reminderDate; this.mode.set('reminder'); }

  openHistory(record: Credit) {
    this.history.set([]);
    this.mode.set('history');
    this.api.creditHistory(record.id).subscribe(list => this.history.set(list));
  }

  close() { this.mode.set(null); }

  save() {
    if (!this.form.personName.trim() || !this.form.amount || this.form.amount <= 0) { this.error.set('Enter a person name and an amount greater than zero.'); return; }
    if (this.form.settledAmount > this.form.amount) { this.error.set('Settled amount cannot exceed the total amount.'); return; }
    this.busy.set(true);
    const id = this.editing()?.id;
    const call = id ? this.api.updateCredit(id, this.form) : this.api.createCredit(this.form);
    call.subscribe({
      next: () => { this.busy.set(false); this.close(); this.toast.success(id ? 'Record updated' : 'Record added'); this.refresh(); },
      error: () => this.busy.set(false)
    });
  }

  settle() {
    const record = this.selected();
    if (!record || !this.settleForm.amount) return;
    this.busy.set(true);
    this.api.settle(record.id, { amount: this.settleForm.amount, date: this.settleForm.date, paymentMethod: this.settleForm.paymentMethod, notes: this.settleForm.notes }).subscribe({
      next: updated => { this.busy.set(false); this.close(); this.toast.success(updated.remaining > 0 ? `Payment saved · ${this.prefs.money(updated.remaining)} remaining` : 'Fully settled 🎉'); this.refresh(); },
      error: () => this.busy.set(false)
    });
  }

  async markPaid(record: Credit) {
    if (!await this.confirm.ask('Mark as fully paid?', `This records a payment of ${this.prefs.money(record.remaining)} for ${record.personName}.`, 'Mark paid', false)) return;
    this.api.markPaid(record.id).subscribe(() => { this.toast.success('Marked as paid'); this.refresh(); });
  }

  saveReminder() {
    const record = this.selected();
    if (!record) return;
    this.api.setReminder(record.id, this.reminderDate || null).subscribe(() => { this.close(); this.toast.success('Reminder saved'); this.reload(); });
  }

  async remove(record: Credit) {
    if (!await this.confirm.ask('Delete this record?', `${record.personName} · ${this.prefs.money(record.amount)}. Its settlements will be deleted too. This can't be undone.`)) return;
    this.api.deleteCredit(record.id).subscribe(() => { this.toast.success('Record deleted'); this.refresh(); });
  }
}
