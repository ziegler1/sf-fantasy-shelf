import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { forkJoin } from 'rxjs';
import { map } from 'rxjs/operators';
import { BookService } from '../../core/services/book.service';
import { SeriesService } from '../../core/services/series.service';
import type { BookWithDetails } from '../../types/schema.types';

interface StatCard {
  label: string;
  value: string | number;
  icon: string;
  sub?: string;
}

interface BarItem {
  label: string;
  count: number;
  pct: number;
  cls: string;
}

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule, MatButtonModule, MatProgressSpinnerModule, MatTooltipModule],
  templateUrl: './analytics.component.html',
})
export class AnalyticsComponent implements OnInit {
  loading = true;
  exporting = false;
  lastExported: string | null = localStorage.getItem('lastExported');

  statCards: StatCard[] = [];
  statusBars: BarItem[] = [];
  finishedByYear: BarItem[] = [];
  pubDecade: BarItem[] = [];
  tagBars: BarItem[] = [];

  longestRead: BookWithDetails | null = null;
  longestPages = 0;

  constructor(
    private bookService: BookService,
    private seriesService: SeriesService,
  ) {}

  ngOnInit(): void {
    forkJoin({
      booksResp: this.bookService.getAllBooks().pipe(map(books => ({ books }))),
      series:    this.seriesService.getSeries(),
    }).subscribe({
      next: ({ booksResp: { books }, series }) => {
        this.compute(books, series.length);
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  downloadExport(): void {
    if (this.exporting) return;
    this.exporting = true;
    this.bookService.exportLibrary().subscribe({
      next: blob => {
        const date = new Date().toISOString().slice(0, 10);
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `sf-fantasy-shelf-${date}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.lastExported = new Date().toLocaleString();
        localStorage.setItem('lastExported', this.lastExported);
        this.exporting = false;
      },
      error: () => { this.exporting = false; },
    });
  }

  private compute(books: BookWithDetails[], seriesCount: number): void {
    const readBooks    = books.filter(b => b.user_book?.status === 'read');
    const ratedBooks   = readBooks.filter(b => b.user_book?.rating != null);
    const pagesRead    = readBooks.reduce((s, b) => s + (b.page_count ?? 0), 0);
    const avgRating    = ratedBooks.length
      ? ratedBooks.reduce((s, b) => s + b.user_book!.rating!, 0) / ratedBooks.length
      : null;

    const authorSet = new Set<string>();
    books.forEach(b => b.authors.forEach(a => authorSet.add(a.name)));

    // Longest book read
    for (const b of readBooks) {
      if ((b.page_count ?? 0) > this.longestPages) {
        this.longestPages = b.page_count!;
        this.longestRead  = b;
      }
    }

    // ── Stat cards ────────────────────────────────────────────
    this.statCards = [
      { label: 'Books in Library', value: books.length,                   icon: 'menu_book' },
      { label: 'Books Read',       value: readBooks.length,               icon: 'done_all' },
      { label: 'Pages Read',       value: pagesRead.toLocaleString(),     icon: 'description',
        sub: pagesRead > 0 ? undefined : 'Add page counts to your books' },
      { label: 'Authors',          value: authorSet.size,                 icon: 'person' },
      { label: 'Series Tracked',   value: seriesCount,                    icon: 'auto_stories' },
      { label: 'Avg Rating',       value: avgRating ? avgRating.toFixed(1) + ' ★' : '—', icon: 'star' },
    ];

    // ── Status bars ───────────────────────────────────────────
    const sc: Record<string, number> = { 'read': 0, 'reading': 0, 'want-to-read': 0, 'dnf': 0 };
    books.forEach(b => { const s = b.user_book?.status; if (s) sc[s] = (sc[s] ?? 0) + 1; });
    const maxSc = Math.max(...Object.values(sc), 1);
    this.statusBars = [
      { label: 'Read',         count: sc['read'],         pct: (sc['read']         / maxSc) * 100, cls: 'fill-read' },
      { label: 'Reading',      count: sc['reading'],      pct: (sc['reading']      / maxSc) * 100, cls: 'fill-reading' },
      { label: 'Want to Read', count: sc['want-to-read'], pct: (sc['want-to-read'] / maxSc) * 100, cls: 'fill-want' },
      { label: 'DNF',          count: sc['dnf'],          pct: (sc['dnf']          / maxSc) * 100, cls: 'fill-dnf' },
    ];

    // ── Finished by year (finished_at) ────────────────────────
    const fyMap: Record<string, number> = {};
    readBooks.forEach(b => {
      const dt = b.user_book?.finished_at;
      if (dt) { const y = dt.slice(0, 4); fyMap[y] = (fyMap[y] ?? 0) + 1; }
    });
    if (Object.keys(fyMap).length) {
      const maxFy = Math.max(...Object.values(fyMap), 1);
      this.finishedByYear = Object.keys(fyMap).sort().map(y => ({
        label: y, count: fyMap[y], pct: (fyMap[y] / maxFy) * 100, cls: 'fill-accent',
      }));
    }

    // ── Publication decade of read books ──────────────────────
    const decMap: Record<string, number> = {};
    readBooks.forEach(b => {
      if (b.published_at) {
        const yr  = parseInt(b.published_at.slice(0, 4), 10);
        const dec = `${Math.floor(yr / 10) * 10}s`;
        decMap[dec] = (decMap[dec] ?? 0) + 1;
      }
    });
    if (Object.keys(decMap).length) {
      const maxDec = Math.max(...Object.values(decMap), 1);
      this.pubDecade = Object.keys(decMap).sort().map(d => ({
        label: d, count: decMap[d], pct: (decMap[d] / maxDec) * 100, cls: 'fill-blue',
      }));
    }

    // ── Top tags ──────────────────────────────────────────────
    const tagMap: Record<string, number> = {};
    books.forEach(b => b.tags.forEach(t => { tagMap[t.name] = (tagMap[t.name] ?? 0) + 1; }));
    const sorted = Object.entries(tagMap).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (sorted.length) {
      const maxTag = Math.max(...sorted.map(t => t[1]), 1);
      this.tagBars = sorted.map(([name, count]) => ({
        label: name, count, pct: (count / maxTag) * 100, cls: 'fill-accent',
      }));
    }
  }
}
