import { ChangeDetectionStrategy, Component, HostListener, input, output } from '@angular/core';
import { IconComponent } from './icon.component';

/** Right-side drawer on desktop, bottom sheet on mobile. */
@Component({
  selector: 'mv-drawer',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div class="backdrop" (click)="closed.emit()"></div>
      <aside class="drawer" role="dialog" aria-modal="true" [attr.aria-label]="title()">
        <header>
          <h2>{{ title() }}</h2>
          <button class="icon-btn" type="button" (click)="closed.emit()" aria-label="Close"><mv-icon name="close" /></button>
        </header>
        <div class="body"><ng-content /></div>
      </aside>
    }
  `,
  styles: [`
    .backdrop { position: fixed; inset: 0; background: rgba(15, 10, 40, .45); backdrop-filter: blur(2px); z-index: 60; }
    .drawer { position: fixed; top: 0; right: 0; bottom: 0; width: min(480px, 100%); background: var(--surface); z-index: 61;
      display: flex; flex-direction: column; box-shadow: -12px 0 40px rgba(0,0,0,.2); animation: slide .18s ease-out; }
    header { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid var(--line); }
    h2 { margin: 0; font-size: 18px; }
    .body { padding: 20px 22px 28px; overflow-y: auto; flex: 1; }
    @keyframes slide { from { transform: translateX(24px); opacity: 0; } }
    @media (max-width: 640px) {
      .drawer { top: auto; width: 100%; max-height: 92vh; border-radius: 22px 22px 0 0; animation: rise .2s ease-out; }
      @keyframes rise { from { transform: translateY(40px); opacity: 0; } }
    }
  `]
})
export class DrawerComponent {
  readonly open = input(false);
  readonly title = input('');
  readonly closed = output<void>();

  @HostListener('document:keydown.escape')
  onEscape() { if (this.open()) this.closed.emit(); }
}
