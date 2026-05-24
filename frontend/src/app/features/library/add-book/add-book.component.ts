import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subject, debounceTime, distinctUntilChanged, switchMap, of } from 'rxjs';
import { takeUntil, catchError } from 'rxjs/operators';
import { SearchService, BookSearchResult, ImportBookBody } from '../../../core/services/search.service';
import { UpcomingService } from '../../../core/services/upcoming.service';
import type { BookWithDetails, ReadingStatus } from '../../../types/schema.types';

@Component({
  selector: 'app-add-book',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatDialogModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatButtonModule, MatIconModule,
    MatProgressSpinnerModule, MatTooltipModule,
  ],
  templateUrl: './add-book.component.html',
})
export class AddBookComponent implements OnInit, OnDestroy {
  step: 'search' | 'confirm' | 'manual' = 'search';
  query = '';
  results: BookSearchResult[] = [];
  searching = false;
  searchError = false;
  selected: BookSearchResult | null = null;
  status: ReadingStatus = 'want-to-read';
  seriesName = '';
  seriesPosition: number | null = null;
  detectingSeries = false;
  saving = false;
  error: string | null = null;

  manualForm = { title: '', authors: '', year: '', page_count: '', isbn13: '', description: '', cover_url: '' };

  readonly statusOptions: { label: string; value: ReadingStatus }[] = [
    { label: 'Want to Read', value: 'want-to-read' },
    { label: 'Reading',      value: 'reading'      },
    { label: 'Read',         value: 'read'         },
    { label: 'DNF',          value: 'dnf'          },
  ];

  private search$ = new Subject<string>();
  private destroy$ = new Subject<void>();

  constructor(
    private searchService: SearchService,
    private upcomingService: UpcomingService,
    private dialogRef: MatDialogRef<AddBookComponent>,
  ) {}

  ngOnInit(): void {
    this.search$.pipe(
      debounceTime(350),
      distinctUntilChanged(),
      switchMap(q => {
        if (q.trim().length < 2) {
          this.results = [];
          this.searchError = false;
          return of([] as BookSearchResult[]);
        }
        this.searching = true;
        this.searchError = false;
        return this.searchService.searchBooks(q).pipe(
          catchError(() => {
            this.searchError = true;
            return of([] as BookSearchResult[]);
          }),
        );
      }),
      takeUntil(this.destroy$),
    ).subscribe(results => {
      this.results = results;
      this.searching = false;
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onQueryChange(q: string): void {
    this.search$.next(q);
  }

  pick(book: BookSearchResult): void {
    this.selected = book;
    this.seriesName = book.series_name ?? '';
    this.seriesPosition = book.series_position ?? null;
    this.step = 'confirm';
    this.error = null;

    // If Google Books didn't provide series info, ask Claude
    if (!book.series_name) {
      this.detectingSeries = true;
      const author = this.authorLine(book);
      this.searchService.detectSeries(book.title, author).subscribe({
        next: (result) => {
          // Only pre-fill if the user hasn't already typed something
          if (!this.seriesName && result.series_name) {
            this.seriesName = result.series_name;
            this.seriesPosition = result.series_position;
          }
          this.detectingSeries = false;
        },
        error: () => { this.detectingSeries = false; },
      });
    }
  }

  back(): void {
    this.step = 'search';
    this.selected = null;
    this.error = null;
  }

  addToLibrary(): void {
    if (!this.selected || this.saving) return;
    this.saving = true;
    this.error = null;

    const importBody = {
      ...this.selected,
      description:     this.selected.description?.slice(0, 10000) ?? null,
      status:          this.status,
      series_name:     this.seriesName.trim() || null,
      series_position: this.seriesPosition || null,
    };

    this.searchService.importBook(importBody).subscribe({
      next: (book: BookWithDetails) => {
        this.saving = false;
        this.dialogRef.close(book);
      },
      error: (err) => {
        this.saving = false;
        const details = err?.error?.details;
        if (details) {
          const fields = Object.keys(details).join(', ');
          this.error = `Validation failed on: ${fields}`;
          console.error('Import 400 details:', details);
        } else {
          this.error = 'Failed to add book. Please try again.';
        }
      },
    });
  }

  enterManual(): void {
    this.manualForm = { title: '', authors: '', year: '', page_count: '', isbn13: '', description: '', cover_url: '' };
    this.seriesName = '';
    this.seriesPosition = null;
    this.status = 'want-to-read';
    this.error = null;
    this.step = 'manual';
  }

  addManually(): void {
    if (!this.manualForm.title.trim() || this.saving) return;
    this.saving = true;
    this.error = null;
    const year = parseInt(this.manualForm.year, 10);
    const body: ImportBookBody = {
      title: this.manualForm.title.trim(),
      authors: this.manualForm.authors.split(',').map(a => a.trim()).filter(Boolean),
      cover_url: this.toImageUrl(this.manualForm.cover_url.trim() || null),
      published_at: !isNaN(year) ? `${year}-01-01` : null,
      page_count: this.manualForm.page_count ? parseInt(this.manualForm.page_count, 10) : null,
      isbn: null,
      isbn13: this.manualForm.isbn13.trim() || null,
      description: this.manualForm.description.trim() || null,
      language: 'en',
      series_name: this.seriesName.trim() || null,
      series_position: this.seriesPosition || null,
      status: this.status,
    };
    this.searchService.importBook(body).subscribe({
      next: (book: BookWithDetails) => {
        this.saving = false;
        this.dialogRef.close(book);
      },
      error: () => {
        this.saving = false;
        this.error = 'Failed to add book. Please try again.';
      },
    });
  }

  trackAsUpcoming(): void {
    if (!this.selected || this.saving) return;
    this.saving = true;
    this.error = null;
    this.upcomingService.add({
      title: this.selected.title,
      author_name: this.selected.authors.join(', ') || null,
      release_date: this.toDateInput(this.selected.published_at),
      isbn: this.selected.isbn13 || this.selected.isbn || null,
      cover_url: this.toImageUrl(this.selected.cover_url),
      description: this.selected.description,
      notes: null,
    }).subscribe({
      next: () => {
        this.saving = false;
        this.dialogRef.close(undefined);
      },
      error: () => {
        this.saving = false;
        this.error = 'Failed to track release. Please try again.';
      },
    });
  }

  private toDateInput(dt: string | null): string | null {
    if (!dt) return null;
    if (/^\d{4}$/.test(dt)) return `${dt}-01-01`;
    if (/^\d{4}-\d{2}$/.test(dt)) return `${dt}-01`;
    return dt.slice(0, 10);
  }

  private toImageUrl(url: string | null): string | null {
    if (!url) return null;
    const s = url.replace(/^http:\/\//, 'https://');
    const m = s.match(/books\.google\.com\/books\?[^"]*[?&]id=([^&\s"]+)/);
    if (m) return `https://books.google.com/books/content?id=${m[1]}&printsec=frontcover&img=1&zoom=1`;
    return s;
  }

  authorLine(book: BookSearchResult): string {
    return book.authors.join(', ') || 'Unknown Author';
  }

  yearOf(book: BookSearchResult): string {
    return book.published_at ? book.published_at.slice(0, 4) : '';
  }
}
