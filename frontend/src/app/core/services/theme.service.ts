import { Injectable, signal } from '@angular/core';

export type BgKey     = 'dragon' | 'stained-glass' | 'library' | 'library2' | 'winter' | 'space' | 'forest' | 'nebula' | 'dusk' | 'none';
export type AccentKey = 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'teal'
                      | 'crimson' | 'amber' | 'indigo' | 'rose' | 'cyan' | 'lime';

const ALL_ACCENTS: AccentKey[] = [
  'blue', 'purple', 'green', 'orange', 'pink', 'teal',
  'crimson', 'amber', 'indigo', 'rose', 'cyan', 'lime',
];

const USER_STORAGE_KEY = 'sfs_user';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private userId: number | null = null;

  isDark  = signal<boolean>(true);
  bg      = signal<BgKey>('dragon');
  accent  = signal<AccentKey>('blue');

  constructor() {
    // Read user ID from localStorage directly (same entry AuthService writes)
    try {
      const raw = localStorage.getItem(USER_STORAGE_KEY);
      if (raw) this.userId = JSON.parse(raw)?.id ?? null;
    } catch { /* ignore */ }

    this.applyStoredPrefs();
  }

  /** Called by AuthService after a successful login. */
  loadForUser(userId: number): void {
    this.userId = userId;
    this.applyStoredPrefs();
  }

  /** Called by AuthService on logout — reset to defaults. */
  resetToDefaults(): void {
    this.userId = null;
    this.isDark.set(true);
    this.bg.set('dragon');
    this.accent.set('blue');
    document.body.classList.remove('light-theme');
    document.body.setAttribute('data-bg', 'dragon');
    ALL_ACCENTS.forEach(a => document.body.classList.remove(`accent-${a}`));
  }

  toggle(): void {
    this.isDark.update(v => !v);
    localStorage.setItem(this.key('theme'), this.isDark() ? 'dark' : 'light');
    document.body.classList.toggle('light-theme', !this.isDark());
  }

  setBg(key: BgKey): void {
    this.bg.set(key);
    localStorage.setItem(this.key('theme-bg'), key);
    document.body.setAttribute('data-bg', key);
  }

  setAccent(key: AccentKey): void {
    this.accent.set(key);
    localStorage.setItem(this.key('theme-accent'), key);
    this.applyAccentClass(key);
  }

  private key(base: string): string {
    return this.userId ? `${base}-${this.userId}` : base;
  }

  private applyStoredPrefs(): void {
    const dark   = localStorage.getItem(this.key('theme'));
    const bg     = localStorage.getItem(this.key('theme-bg')) as BgKey | null;
    const accent = localStorage.getItem(this.key('theme-accent')) as AccentKey | null;

    const isDark = dark !== 'light';
    this.isDark.set(isDark);
    document.body.classList.toggle('light-theme', !isDark);

    const resolvedBg = bg ?? 'dragon';
    this.bg.set(resolvedBg);
    document.body.setAttribute('data-bg', resolvedBg);

    const resolvedAccent = accent ?? 'blue';
    this.accent.set(resolvedAccent);
    this.applyAccentClass(resolvedAccent);
  }

  private applyAccentClass(key: AccentKey): void {
    ALL_ACCENTS.forEach(a => document.body.classList.remove(`accent-${a}`));
    if (key !== 'blue') document.body.classList.add(`accent-${key}`);
  }
}
