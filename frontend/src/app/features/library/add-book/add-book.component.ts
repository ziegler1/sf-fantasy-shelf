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
import { SearchService, BookSearchResult } from '../../../core/services/search.service';
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
  step: 'search' | 'confirm' = 'search';
  query = '';
  results: BookSearchResult[] = [];
  searching = false;
  selected: BookSearchResult | null = null;
  status: ReadingStatus | '' = 'want-to-read';
  saving = false;
  error: string | null = null;

  readonly statusOptions: { label: string; value: ReadingStatus | '' }[] = [
    { label: 'Just add (no status)',  value: '' },
    { label: 'Want to Read',          value: 'want-to-read' },
    { label: 'Reading',               value: 'reading' },
    { label: 'Read',                  value: 'read' },
    { label: 'DNF',                   value: 'dnf' },
  ];

  private search$ = new Subject<string>();
  private destroy$ = new Subject<void>();

  constructor(
    private searchService: SearchService,
    private dialogRef: MatDialogRef<AddBookComponent>,
  ) {}

  ngOnInit(): void {
    this.search$.pipe(
      debounceTime(350),
      distinctUntilChanged(),
      switchMap(q => {
        if (q.trim().length < 2) { this.results = []; return of([]); }
        this.searching = true;
        return this.searchService.searchBooks(q).pipe(catchError(() => of([])));
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
    this.step = 'confirm';
    this.error = null;
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

    const body = {
      ...this.selected,
      status: (this.status as ReadingStatus) || undefined,
    };
    // google_id is not a DB field — strip it
    const { google_id: _gid, ...importBody } = body;

    this.searchService.importBook(importBody).subscribe({
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

  authorLine(book: BookSearchResult): string {
    return book.authors.join(', ') || 'Unknown Author';
  }

  yearOf(book: BookSearchResult): string {
    return book.published_at ? book.published_at.slice(0, 4) : '';
  }
}
