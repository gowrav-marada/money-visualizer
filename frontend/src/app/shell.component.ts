import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ApiService } from './core/api.service';
import { AppNotification, Me } from './core/models';
import { PreferencesService } from './core/preferences.service';
import { ConfirmService, ToastService } from './core/toast.service';
import { IconComponent } from './shared/icon.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell">
      <nav class="sidebar" aria-label="Main">
        <a class="brand" routerLink="/dashboard">
          <span class="logo">₹</span>
          <span><b>Money</b>Visualizer</span>
        </a>
        @for (item of nav; track item.path) {
          <a class="nav-link" [routerLink]="item.path" routerLinkActive="active">
            <mv-icon [name]="item.icon" /> <span>{{ item.label }}</span>
          </a>
        }
        <div class="sidebar-foot">
          @if (me(); as user) {
            <div class="user">
              <span class="avatar">{{ user.displayName.charAt(0) }}</span>
              <span class="user-text"><b>{{ user.displayName }}</b><small>{{ user.email || 'Local dev user' }}</small></span>
            </div>
            @if (!user.usesDevelopmentSignIn) {
              <button class="nav-link" type="button" (click)="logout()"><mv-icon name="logout" /> <span>Sign out</span></button>
            }
          }
        </div>
      </nav>

      <div class="main">
        <header class="topbar">
          <a class="brand mobile-only" routerLink="/dashboard"><span class="logo">₹</span><span><b>Money</b>Visualizer</span></a>
          <span class="spacer"></span>
          <button class="icon-btn" type="button" (click)="toggleTheme()" [attr.aria-label]="'Theme: ' + prefs.theme()">
            <mv-icon [name]="isDark() ? 'sun' : 'moon'" />
          </button>
          <div class="bell-wrap">
            <button class="icon-btn" type="button" (click)="toggleNotifications()" aria-label="Notifications">
              <mv-icon name="bell" />
              @if (unread() > 0) { <span class="badge">{{ unread() }}</span> }
            </button>
            @if (showNotifications()) {
              <div class="popover">
                <div class="popover-head">
                  <b>Notifications</b>
                  @if (unread() > 0) { <button class="link-btn" type="button" (click)="readAll()">Mark all read</button> }
                </div>
                @for (note of notifications(); track note.id) {
                  <button class="note" type="button" [class.unread]="!note.isRead" (click)="openNotification(note)">
                    <b>{{ note.title }}</b><span>{{ note.message }}</span>
                  </button>
                } @empty {
                  <p class="muted pad">You're all caught up 🎉</p>
                }
              </div>
            }
          </div>
        </header>
        <main class="content"><router-outlet /></main>
      </div>

      <nav class="bottom-nav" aria-label="Main">
        @for (item of nav; track item.path) {
          <a [routerLink]="item.path" routerLinkActive="active"><mv-icon [name]="item.icon" /><span>{{ item.short }}</span></a>
        }
      </nav>
    </div>

    <div class="toasts" aria-live="polite">
      @for (toast of toasts.toasts(); track toast.id) {
        <div [class]="'toast ' + toast.kind" (click)="toasts.dismiss(toast.id)">
          <mv-icon [name]="toast.kind === 'success' ? 'check' : toast.kind === 'error' ? 'alert' : 'info'" [size]="18" />
          <span>{{ toast.message }}</span>
        </div>
      }
    </div>

    @if (confirm.pending(); as request) {
      <div class="backdrop-center" (click)="confirm.close(false)">
        <div class="dialog" role="alertdialog" aria-modal="true" (click)="$event.stopPropagation()">
          <h3>{{ request.title }}</h3>
          <p>{{ request.message }}</p>
          <div class="row-end">
            <button class="btn ghost" type="button" (click)="confirm.close(false)">Cancel</button>
            <button class="btn" type="button" [class.danger]="request.danger" (click)="confirm.close(true)">{{ request.confirmText }}</button>
          </div>
        </div>
      </div>
    }
  `
})
export class AppComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  readonly prefs = inject(PreferencesService);
  readonly toasts = inject(ToastService);
  readonly confirm = inject(ConfirmService);

  readonly nav = [
    { path: '/dashboard', label: 'Dashboard', short: 'Home', icon: 'dashboard' },
    { path: '/credits', label: 'Credits & Debits', short: 'People', icon: 'people' },
    { path: '/expenses', label: 'Expenses', short: 'Expenses', icon: 'wallet' },
    { path: '/bills', label: 'Bills', short: 'Bills', icon: 'bill' },
    { path: '/settings', label: 'Settings', short: 'Settings', icon: 'settings' }
  ];

  readonly me = signal<Me | null>(null);
  readonly notifications = signal<AppNotification[]>([]);
  readonly unread = signal(0);
  readonly showNotifications = signal(false);

  ngOnInit() {
    this.api.me().subscribe(user => {
      this.me.set(user);
      this.api.settings().subscribe(settings => this.prefs.apply(settings));
      this.loadNotifications();
    });
  }

  isDark() { return document.documentElement.classList.contains('dark'); }

  toggleTheme() { this.prefs.theme.set(this.isDark() ? 'Light' : 'Dark'); }

  loadNotifications() {
    this.api.notifications().subscribe(list => {
      this.notifications.set(list.slice(0, 15));
      this.unread.set(list.filter(note => !note.isRead).length);
    });
  }

  toggleNotifications() { this.showNotifications.update(open => !open); }

  openNotification(note: AppNotification) {
    this.showNotifications.set(false);
    if (!note.isRead) this.api.readNotification(note.id).subscribe(() => this.loadNotifications());
    if (note.link) this.router.navigateByUrl(note.link);
  }

  readAll() { this.api.readAllNotifications().subscribe(() => this.loadNotifications()); }

  logout() { this.api.logout().subscribe(() => window.location.href = '/'); }
}
