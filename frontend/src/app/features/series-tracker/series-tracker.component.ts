import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SeriesService } from '../../core/services/series.service';
import { BookService } from '../../core/services/book.service';
import { BookDetailComponent } from '../library/book-detail/book-detail.component';
import type { SeriesWithBooks, BookWithDetails, ReadingStatus } from '../../types/schema.types';
import { forkJoin } from 'rxjs';

interface EnrichedSeries extends SeriesWithBooks {
  readCount: number;
  progress: number;
}

@Component({
  selector: 'app-series-tracker',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule, MatProgressBarModule, MatIconModule,
    MatProgressSpinnerModule, MatTooltipModule,
  ],
  templateUrl: './series-tracker.component.html',
})
export class SeriesTrackerComponent implements OnInit {
  seriesList: EnrichedSeries[] = [];
  loading = true;
  expanded = new Set<number>();

  private bookMap = new Map<number, BookWithDetails>();

  readonly statusLabels: Record<ReadingStatus, string> = {
    'read': 'Read', 'reading': 'Reading',
    'want-to-read': 'Want to Read', 'dnf': 'DNF',
  };

  constructor(
    private seriesService: SeriesService,
    private bookService: BookService,
    private dialog: MatDialog,
  ) {}

  ngOnInit(): void {
    forkJoin({
      series: this.seriesService.getSeries(),
      books:  this.bookService.getBooks(),
    }).subscribe({
      next: ({ series, books }) => {
        this.bookMap = new Map(books.map(b => [b.id, b]));

        const readSet = new Set(
          books.filter(b => b.user_book?.status === 'read').map(b => b.id),
        );

        this.seriesList = series.map(s => {
          const readCount = s.books.filter(b => readSet.has(b.id)).length;
          return {
            ...s,
            books: [...s.books].sort((a, b) => (a.position ?? 999) - (b.position ?? 999)),
            readCount,
            progress: s.books.length
              ? Math.round((readCount / s.books.length) * 100)
              : 0,
          };
        });

        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  toggleExpanded(seriesId: number): void {
    if (this.expanded.has(seriesId)) {
      this.expanded.delete(seriesId);
    } else {
      this.expanded.add(seriesId);
    }
  }

  isExpanded(seriesId: number): boolean {
    return this.expanded.has(seriesId);
  }

  openBook(bookId: number): void {
    const book = this.bookMap.get(bookId);
    if (!book) return;
    const ref = this.dialog.open(BookDetailComponent, {
      data: book,
      panelClass: 'book-detail-panel',
      maxWidth: '100vw',
    });
    ref.afterClosed().subscribe((result: BookWithDetails | { deleted: true; id: number } | undefined) => {
      if (!result) return;
      if ('deleted' in result) {
        this.bookMap.delete(result.id);
        // Rebuild series list without the deleted book
        this.seriesList = this.seriesList.map(s => ({
          ...s,
          books: s.books.filter(b => b.id !== result.id),
        })).filter(s => s.books.length);
      } else {
        this.bookMap.set(result.id, result);
      }
    });
  }

  statusClass(bookId: number): string {
    const status = this.bookMap.get(bookId)?.user_book?.status;
    return status ? `status-${status}` : 'status-none';
  }

  statusLabel(bookId: number): string {
    const status = this.bookMap.get(bookId)?.user_book?.status;
    return status ? this.statusLabels[status] : 'Not on shelf';
  }

  coverUrl(bookId: number): string | null {
    return this.bookMap.get(bookId)?.cover_url ?? null;
  }

  inLibrary(bookId: number): boolean {
    return this.bookMap.has(bookId);
  }
}
