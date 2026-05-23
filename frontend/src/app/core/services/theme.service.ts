import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly KEY = 'theme';
  isDark = signal<boolean>(true);

  constructor() {
    if (localStorage.getItem(this.KEY) === 'light') {
      this.isDark.set(false);
      document.body.classList.add('light-theme');
    }
  }

  toggle(): void {
    this.isDark.update(v => !v);
    localStorage.setItem(this.KEY, this.isDark() ? 'dark' : 'light');
    document.body.classList.toggle('light-theme', !this.isDark());
  }
}
