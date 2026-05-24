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
import { AddBookComponent } from '../library/add-book/add-book.component';
import type { SeriesWithBooks, BookWithDetails, ReadingStatus } from '../../types/schema.types';
import { forkJoin } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';

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
    MatProgressSpinnerModule, MatTooltipModule, MatButtonModule,
  ],
  templateUrl: './series-tracker.component.html',
})
export class SeriesTrackerComponent implements OnInit {
  seriesList: EnrichedSeries[] = [];
  loading = true;
  expanded    = new Set<number>();
  adding      = new Set<number>();
  removing    = new Set<string>();
  populating  = new Set<number>();

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
      books:  this.bookService.getBooks({ limit: 200 }),
    }).subscribe({
      next: ({ series, books: { books } }) => {
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

  addToLibrary(bookId: number, event: Event): void {
    event.stopPropagation();
    if (this.adding.has(bookId)) return;
    this.adding.add(bookId);

    this.bookService.updateShelf(bookId, { status: 'want-to-read' }).subscribe({
      next: () => {
        // Fetch enriched data so the row updates with the correct status badge
        this.bookService.getBook(bookId).subscribe({
          next: book => {
            this.bookMap.set(bookId, book);
            this.adding.delete(bookId);
          },
          error: () => this.adding.delete(bookId),
        });
      },
      error: () => this.adding.delete(bookId),
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

  openAddBook(series: EnrichedSeries): void {
    const ref = this.dialog.open(AddBookComponent, {
      data: { seriesName: series.name },
      panelClass: 'book-detail-panel',
      maxWidth: '100vw',
    });
    ref.afterClosed().subscribe((book: BookWithDetails | undefined) => {
      if (!book) return;
      this.reloadSeries(series.id);
    });
  }

  repopulate(series: EnrichedSeries, event: Event): void {
    event.stopPropagation();
    if (this.populating.has(series.id)) return;
    this.populating.add(series.id);
    this.seriesService.populateSeries(series.id).subscribe({
      next: () => {
        // Population runs in the background on the server; wait a few seconds then reload
        setTimeout(() => {
          this.reloadSeries(series.id);
          this.populating.delete(series.id);
        }, 8000);
      },
      error: () => this.populating.delete(series.id),
    });
  }

  private reloadSeries(seriesId: number): void {
    forkJoin({
      series: this.seriesService.getSeriesById(seriesId),
      books:  this.bookService.getBooks({ limit: 1000 }),
    }).subscribe({
      next: ({ series, books: { books } }) => {
        books.forEach(b => this.bookMap.set(b.id, b));
        const readSet = new Set(
          books.filter(b => b.user_book?.status === 'read').map(b => b.id),
        );
        const readCount = series.books.filter(b => readSet.has(b.id)).length;
        const enriched: EnrichedSeries = {
          ...series,
          books: [...series.books].sort((a, b) => (a.position ?? 999) - (b.position ?? 999)),
          readCount,
          progress: series.books.length
            ? Math.round((readCount / series.books.length) * 100)
            : 0,
        };
        this.seriesList = this.seriesList.map(s => s.id === seriesId ? enriched : s);
      },
    });
  }

  removeFromSeries(seriesId: number, bookId: number, event: Event): void {
    event.stopPropagation();
    const key = `${seriesId}-${bookId}`;
    if (this.removing.has(key)) return;
    this.removing.add(key);
    this.seriesService.removeBookFromSeries(seriesId, bookId).subscribe({
      next: () => {
        this.removing.delete(key);
        this.seriesList = this.seriesList
          .map(s => s.id === seriesId
            ? { ...s, books: s.books.filter(b => b.id !== bookId) }
            : s)
          .filter(s => s.books.length > 0);
      },
      error: () => this.removing.delete(key),
    });
  }
}
