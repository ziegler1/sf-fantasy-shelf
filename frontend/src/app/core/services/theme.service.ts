import { Injectable, signal } from '@angular/core';

export type BgKey     = 'dragon' | 'stained-glass' | 'library' | 'library2' | 'winter' | 'space' | 'forest' | 'nebula' | 'dusk' | 'none';
export type AccentKey = 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'teal';

const ALL_ACCENTS: AccentKey[] = ['blue', 'purple', 'green', 'orange', 'pink', 'teal'];

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly DARK_KEY   = 'theme';
  private readonly BG_KEY     = 'theme-bg';
  private readonly ACCENT_KEY = 'theme-accent';

  isDark = signal<boolean>(true);
  bg     = signal<BgKey>('dragon');
  accent = signal<AccentKey>('blue');

  constructor() {
    if (localStorage.getItem(this.DARK_KEY) === 'light') {
      this.isDark.set(false);
      document.body.classList.add('light-theme');
    }

    const savedBg = (localStorage.getItem(this.BG_KEY) as BgKey | null) ?? 'dragon';
    this.bg.set(savedBg);
    document.body.setAttribute('data-bg', savedBg);

    const savedAccent = localStorage.getItem(this.ACCENT_KEY) as AccentKey | null;
    if (savedAccent) {
      this.accent.set(savedAccent);
      this.applyAccentClass(savedAccent);
    }
  }

  toggle(): void {
    this.isDark.update(v => !v);
    localStorage.setItem(this.DARK_KEY, this.isDark() ? 'dark' : 'light');
    document.body.classList.toggle('light-theme', !this.isDark());
  }

  setBg(key: BgKey): void {
    this.bg.set(key);
    localStorage.setItem(this.BG_KEY, key);
    document.body.setAttribute('data-bg', key);
  }

  setAccent(key: AccentKey): void {
    this.accent.set(key);
    localStorage.setItem(this.ACCENT_KEY, key);
    this.applyAccentClass(key);
  }

  private applyAccentClass(key: AccentKey): void {
    ALL_ACCENTS.forEach(a => document.body.classList.remove(`accent-${a}`));
    if (key !== 'blue') {
      document.body.classList.add(`accent-${key}`);
    }
  }
}
