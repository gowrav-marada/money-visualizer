import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { Account, AccountKind, Category, Settings } from '../core/models';
import { PreferencesService } from '../core/preferences.service';
import { ConfirmService, ToastService } from '../core/toast.service';
import { IconComponent } from '../shared/icon.component';
import { SkeletonComponent } from '../shared/ui';

@Component({
  selector: 'mv-settings',
  imports: [FormsModule, RouterLink, IconComponent, SkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-head"><div><h1>Settings</h1><p>Preferences, categories, accounts and your data.</p></div></div>

    <div class="segmented">
      @for (s of sections; track s.id) { <button type="button" [class.active]="section() === s.id" (click)="section.set(s.id)">{{ s.label }}</button> }
    </div>

    @if (settings(); as st) {
      @switch (section()) {
        @case ('general') {
          <form class="panel form" style="max-width:640px" (ngSubmit)="save()">
            <div class="form-row">
              <label class="field"><span>Currency</span><select class="input" name="cur" [(ngModel)]="draft.currency">@for (c of currencies; track c) { <option [value]="c">{{ c }}</option> }</select></label>
              <label class="field"><span>Number format</span><select class="input" name="loc" [(ngModel)]="draft.locale"><option value="en-IN">Indian (₹1,25,000)</option><option value="en-US">International (125,000)</option><option value="en-GB">UK</option></select></label>
            </div>
            <div class="form-row">
              <label class="field"><span>Date format</span><select class="input" name="df" [(ngModel)]="draft.dateFormat"><option value="dd MMM yyyy">05 Jan 2026</option><option value="dd/MM/yyyy">05/01/2026</option><option value="MM/dd/yyyy">01/05/2026</option><option value="yyyy-MM-dd">2026-01-05</option></select></label>
              <label class="field"><span>Theme</span><select class="input" name="th" [(ngModel)]="draft.theme"><option value="System">System</option><option value="Light">Light</option><option value="Dark">Dark</option></select></label>
            </div>
            <label class="field"><span>Time zone</span><input class="input" name="tz" [(ngModel)]="draft.timeZone" placeholder="Asia/Kolkata" /></label>
            <label class="field"><span>Monthly budget (optional)</span><input class="input" type="number" min="0" name="bud" [(ngModel)]="draft.monthlyBudget" /></label>
            Preview: {{ previewText() }}
            <div class="row-end"><button class="btn" type="submit" [disabled]="busy()">Save preferences</button></div>
          </form>
        }
        @case ('notifications') {
          <form class="panel form" style="max-width:640px" (ngSubmit)="save()">
            <label class="check"><input type="checkbox" name="ne" [(ngModel)]="draft.notificationsEnabled" /> In-app reminders for bills and people</label>
            <div class="form-row">
              <label class="field"><span>Remind me before due date (days)</span><input class="input" type="number" min="0" max="30" name="brd" [(ngModel)]="draft.billReminderDays" /></label>
              <label class="field"><span>Mark as "due soon" within (days)</span><input class="input" type="number" min="1" max="30" name="dsd" [(ngModel)]="draft.dueSoonDays" /></label>
            </div>
            <label class="field"><span>Payment methods (comma separated)</span><input class="input" name="pm" [(ngModel)]="methodsText" /></label>
            <div class="row-end"><button class="btn" type="submit" [disabled]="busy()">Save</button></div>
          </form>
        }
        @case ('categories') {
          <div class="grid-2">
            @for (kind of ['Expense', 'Income']; track kind) {
              <section class="panel">
                <div class="panel-head"><h2>{{ kind }} categories</h2></div>
                @for (c of byKind(kind); track c.id) {
                  <div class="list-item">
                    <span class="grow"><span class="title">{{ c.name }}</span><span class="sub">{{ c.usageCount }} transaction(s) {{ c.excludeFromTotals ? '· transfer, not counted' : '' }} {{ c.isSystem ? '· built-in' : '' }}</span></span>
                    @if (!c.isSystem) {
                      <button class="icon-btn" type="button" title="Rename" (click)="renameCategory(c)"><mv-icon name="edit" [size]="18" /></button>
                      <button class="icon-btn danger" type="button" title="Delete" (click)="deleteCategory(c)"><mv-icon name="trash" [size]="18" /></button>
                    }
                  </div>
                }
                <form class="toolbar" style="margin:12px 0 0" (ngSubmit)="addCategory(kind)">
                  <input class="input" style="flex:1" [name]="'new' + kind" [(ngModel)]="newCategory[kind]" placeholder="New category" />
                  <button class="btn small" type="submit">Add</button>
                </form>
              </section>
            }
          </div>
        }
        @case ('accounts') {
          <section class="panel" style="max-width:760px">
            <div class="panel-head"><h2>Accounts & cards</h2></div>
            @for (a of accounts(); track a.id) {
              <div class="list-item">
                <span class="dot-icon" style="background:var(--teal-soft);color:var(--teal)"><mv-icon [name]="a.kind === 'CreditCard' ? 'card' : 'wallet'" [size]="18" /></span>
                <span class="grow"><span class="title">{{ a.name }} {{ a.isArchived ? '(archived)' : '' }}</span><span class="sub">{{ a.kind }} {{ a.maskedNumber || '' }}</span></span>
                <button class="btn small ghost" type="button" (click)="toggleArchive(a)">{{ a.isArchived ? 'Restore' : 'Archive' }}</button>
                <button class="icon-btn danger" type="button" title="Delete" (click)="deleteAccount(a)"><mv-icon name="trash" [size]="18" /></button>
              </div>
            } @empty { <p class="muted">No accounts yet.</p> }
            <form class="form" style="margin-top:14px" (ngSubmit)="addAccount()">
              <div class="form-row">
                <label class="field"><span>Name</span><input class="input" name="an" [(ngModel)]="newAccount.name" placeholder="HDFC Savings" required /></label>
                <label class="field"><span>Type</span><select class="input" name="ak" [(ngModel)]="newAccount.kind">@for (k of accountKinds; track k) { <option [value]="k">{{ k }}</option> }</select></label>
              </div>
              <label class="field"><span>Card / account number (only last 4 digits are stored)</span><input class="input" name="anum" [(ngModel)]="newAccount.number" inputmode="numeric" /></label>
              <div class="row-end"><button class="btn" type="submit">Add account</button></div>
            </form>
          </section>
        }
        @case ('security') {
          <div class="grid-2">
            <section class="panel form">
              <h2>App lock</h2>
              <p class="muted" style="margin:0">{{ st.appLockEnabled ? 'A PIN is required to unlock the app on this device.' : 'Protect the app with a 4–8 digit PIN.' }}</p>
              @if (st.appLockEnabled) { <label class="field"><span>Current PIN</span><input class="input" type="password" inputmode="numeric" maxlength="8" [(ngModel)]="currentPin" name="cp" /></label> }
              <label class="field"><span>{{ st.appLockEnabled ? 'New PIN' : 'PIN' }}</span><input class="input" type="password" inputmode="numeric" maxlength="8" [(ngModel)]="pin" name="np" /></label>
              <div class="row-end">
                @if (st.appLockEnabled) { <button class="btn ghost" type="button" (click)="disableLock()">Turn off</button> }
                <button class="btn" type="button" (click)="setPin()">{{ st.appLockEnabled ? 'Change PIN' : 'Enable lock' }}</button>
              </div>
            </section>
            <section class="panel form">
              <h2>Email connection</h2>
              <p class="muted" style="margin:0">Connect Gmail or Outlook with read-only access to detect bills.</p>
              <div><a class="btn ghost" routerLink="/bills" [queryParams]="{ tab: 'email' }"><mv-icon name="mail" [size]="18" /> Manage email</a></div>
            </section>
          </div>
        }
        @case ('data') {
          <div class="grid-2">
            <section class="panel form">
              <h2>Export & backup</h2>
              <p class="muted" style="margin:0">Download your transactions as CSV, or a full JSON backup (mailbox tokens are never included).</p>
              <div class="row-end" style="justify-content:flex-start">
                <a class="btn ghost" href="/api/expenses/export" download><mv-icon name="download" [size]="18" /> Transactions CSV</a>
                <a class="btn" href="/api/settings/backup" download><mv-icon name="download" [size]="18" /> Full backup</a>
              </div>
            </section>
            <section class="panel form" style="border-color:var(--red)">
              <h2 style="color:var(--red)">Delete account</h2>
              <p class="muted" style="margin:0">Permanently deletes all your records, attachments and email connections. Type <b>DELETE</b> to confirm.</p>
              <input class="input" [(ngModel)]="deleteText" name="del" placeholder="DELETE" />
              <div class="row-end"><button class="btn danger" type="button" [disabled]="deleteText !== 'DELETE'" (click)="deleteEverything()">Delete everything</button></div>
            </section>
          </div>
        }
      }
    } @else { <mv-skeleton [cardCount]="0" [rowCount]="5" /> }
  `
})
export class SettingsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly prefs = inject(PreferencesService);

  readonly sections = [
    { id: 'general', label: 'General' }, { id: 'notifications', label: 'Reminders' }, { id: 'categories', label: 'Categories' },
    { id: 'accounts', label: 'Accounts' }, { id: 'security', label: 'Security' }, { id: 'data', label: 'Data' }
  ];
  readonly currencies = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD'];
  readonly accountKinds: AccountKind[] = ['Bank', 'CreditCard', 'Cash', 'Wallet', 'Upi', 'Other'];

  readonly section = signal('general');
  readonly settings = signal<Settings | null>(null);
  readonly categories = signal<Category[]>([]);
  readonly accounts = signal<Account[]>([]);
  readonly busy = signal(false);

  draft!: Settings;
  methodsText = '';
  newCategory: Record<string, string> = { Expense: '', Income: '' };
  newAccount = { name: '', kind: 'Bank', number: '' };
  pin = ''; currentPin = ''; deleteText = '';

  readonly byKind = (kind: string) => this.categories().filter(c => c.kind === kind);

  ngOnInit() {
    this.load();
    this.api.categories().subscribe(list => this.categories.set(list));
    this.loadAccounts();
  }

  load() {
    this.api.settings().subscribe(s => {
      this.settings.set(s);
      this.draft = { ...s };
      this.methodsText = s.paymentMethods.join(', ');
    });
  }

  loadAccounts() { this.api.accounts().subscribe(list => this.accounts.set(list)); }

  previewText() {
    return new Intl.NumberFormat(this.draft?.locale || 'en-IN', { style: 'currency', currency: this.draft?.currency || 'INR', maximumFractionDigits: 0 }).format(125000);
  }

  save() {
    const methods = this.methodsText.split(',').map(m => m.trim()).filter(Boolean);
    if (!methods.length) { this.toast.error('Add at least one payment method.'); return; }
    this.busy.set(true);
    const { appLockEnabled, ...body } = this.draft;
    this.api.saveSettings({ ...body, paymentMethods: methods, monthlyBudget: body.monthlyBudget || null }).subscribe({
      next: s => { this.busy.set(false); this.settings.set(s); this.draft = { ...s }; this.prefs.apply(s); this.toast.success('Settings saved'); },
      error: () => this.busy.set(false)
    });
  }

  addCategory(kind: string) {
    const name = this.newCategory[kind]?.trim();
    if (!name) return;
    this.api.saveCategory({ name, kind, excludeFromTotals: false }).subscribe(() => {
      this.newCategory[kind] = '';
      this.toast.success('Category added');
      this.api.categories().subscribe(list => this.categories.set(list));
    });
  }

  renameCategory(c: Category) {
    const name = prompt('Rename category', c.name)?.trim();
    if (!name || name === c.name) return;
    this.api.saveCategory({ name, kind: c.kind, excludeFromTotals: c.excludeFromTotals }, c.id).subscribe(() => this.api.categories().subscribe(list => this.categories.set(list)));
  }

  async deleteCategory(c: Category) {
    if (!await this.confirm.ask('Delete category?', c.usageCount ? `${c.usageCount} transaction(s) will move to "Other".` : `Delete "${c.name}"?`)) return;
    this.api.deleteCategory(c.id).subscribe(() => { this.toast.success('Category deleted'); this.api.categories().subscribe(list => this.categories.set(list)); });
  }

  addAccount() {
    if (!this.newAccount.name.trim()) return;
    this.api.saveAccount({ name: this.newAccount.name.trim(), kind: this.newAccount.kind, number: this.newAccount.number || null, isArchived: false }).subscribe(() => {
      this.newAccount = { name: '', kind: 'Bank', number: '' };
      this.toast.success('Account added');
      this.loadAccounts();
    });
  }

  toggleArchive(a: Account) {
    this.api.saveAccount({ name: a.name, kind: a.kind, number: null, isArchived: !a.isArchived }, a.id).subscribe(() => this.loadAccounts());
  }

  async deleteAccount(a: Account) {
    if (!await this.confirm.ask('Delete account?', `Transactions linked to "${a.name}" keep their data but lose the account link.`)) return;
    this.api.deleteAccount(a.id).subscribe(() => { this.toast.success('Account deleted'); this.loadAccounts(); });
  }

  setPin() {
    if (!/^\d{4,8}$/.test(this.pin)) { this.toast.error('PIN must be 4 to 8 digits.'); return; }
    this.api.setPin(this.pin, this.currentPin || null).subscribe(() => { this.pin = ''; this.currentPin = ''; this.toast.success('App lock PIN saved'); this.load(); });
  }

  disableLock() {
    if (!this.currentPin) { this.toast.error('Enter your current PIN.'); return; }
    this.api.disableLock(this.currentPin).subscribe(() => { this.currentPin = ''; this.toast.success('App lock turned off'); this.load(); });
  }

  async deleteEverything() {
    if (!await this.confirm.ask('Delete everything?', 'All your financial data will be permanently removed. This cannot be undone.', 'Delete forever')) return;
    this.api.deleteEverything().subscribe(() => { this.toast.success('Your data was deleted'); setTimeout(() => location.href = '/', 800); });
  }
}
