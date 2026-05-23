import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subject, debounceTime, distinctUntilChanged, switchMap, of } from 'rxjs';
import { takeUntil, catchError } from 'rxjs/operators';
import { SearchService, BookSearchResult } from '../../core/services/search.service';
import { UpcomingService } from '../../core/services/upcoming.service';
import type { UpcomingRelease } from '../../types/schema.types';

@Component({
  selector: 'app-add-upcoming-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatTooltipModule,
  ],
  template: `
    <div class="dialog-wrap">

      <!-- ── Step 1: Search ──────────────────────────────────── -->
      @if (step === 'search') {
        <h2 class="dialog-title">Add Upcoming Release</h2>

        <mat-form-field appearance="outline" class="full-field">
          <mat-label>Search by title or author</mat-label>
          <input matInput [(ngModel)]="query" (ngModelChange)="onQueryChange($event)"
                 autocomplete="off" autofocus>
          <mat-icon matSuffix>search</mat-icon>
        </mat-form-field>

        @if (searching) {
          <div class="center-state"><mat-spinner diameter="32" /></div>
        } @else if (results.length) {
          <div class="results-list">
            @for (book of results; track book.google_id) {
              <div class="result-row" role="button" tabindex="0"
                   (click)="pickResult(book)" (keydown.enter)="pickResult(book)">
                <div class="result-cover">
                  @if (book.cover_url) {
                    <img [src]="book.cover_url" [alt]="book.title" class="result-cover-img">
                  } @else {
                    <div class="result-cover-placeholder"><mat-icon>menu_book</mat-icon></div>
                  }
                </div>
                <div class="result-info">
                  <p class="result-title">{{ book.title }}</p>
                  <p class="result-author">{{ book.authors.join(', ') || 'Unknown Author' }}</p>
                  <p class="result-meta">
                    @if (book.published_at) { <span>{{ book.published_at.slice(0,4) }}</span> }
                    @if (book.page_count) { <span>· {{ book.page_count }}p</span> }
                  </p>
                </div>
                <mat-icon class="result-arrow">chevron_right</mat-icon>
              </div>
            }
          </div>
        } @else if (query.trim().length >= 2) {
          <div class="center-state muted">No results found.</div>
        }

        <div class="manual-link-row">
          <button mat-button class="manual-link-btn" (click)="enterManual()">
            <mat-icon>edit_note</mat-icon> Add manually
          </button>
        </div>
      }

      <!-- ── Step 2: Confirm / edit form ────────────────────── -->
      @if (step === 'form') {
        <div class="form-header">
          <button mat-icon-button class="back-btn" (click)="step = 'search'">
            <mat-icon>arrow_back</mat-icon>
          </button>
          <h2 class="dialog-title">{{ fromSearch ? 'Confirm Details' : 'Add Manually' }}</h2>
        </div>

        <mat-form-field appearance="outline" class="full-field">
          <mat-label>Title *</mat-label>
          <input matInput [(ngModel)]="form.title" autocomplete="off">
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-field">
          <mat-label>Author</mat-label>
          <input matInput [(ngModel)]="form.author_name">
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-field">
          <mat-label>Release date</mat-label>
          <input matInput type="date" [(ngModel)]="form.release_date">
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-field">
          <mat-label>ISBN</mat-label>
          <input matInput [(ngModel)]="form.isbn">
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-field">
          <mat-label>Cover image URL</mat-label>
          <input matInput [(ngModel)]="form.cover_url" placeholder="https://…">
          <mat-icon matSuffix>image</mat-icon>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-field">
          <mat-label>Notes</mat-label>
          <textarea matInput [(ngModel)]="form.notes" rows="2"></textarea>
        </mat-form-field>

        @if (error) { <p class="error-msg">{{ error }}</p> }

        <div class="dialog-actions">
          <button mat-button (click)="step = 'search'" [disabled]="saving">Cancel</button>
          <button mat-flat-button color="primary" (click)="save()"
                  [disabled]="saving || !form.title.trim()">
            @if (saving) { <mat-spinner diameter="18" style="display:inline-block" /> }
            @else { <mat-icon>add</mat-icon> }
            Add
          </button>
        </div>
      }

    </div>

    <style>
    .dialog-wrap {
      width: min(480px, 90vw);
      background: #1e293b;
      color: #e2e8f0;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
    }
    .dialog-title {
      font-size: 1.1rem;
      font-weight: 700;
      color: #f1f5f9;
      margin: 0 0 1rem;
    }
    .full-field { width: 100%; margin-bottom: 0.25rem; }
    .center-state {
      display: flex;
      justify-content: center;
      padding: 2rem 0;
    }
    .center-state.muted { color: #475569; font-size: 0.85rem; }
    .results-list {
      max-height: 340px;
      overflow-y: auto;
      margin: 0 -0.25rem;
    }
    .result-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.5rem 0.25rem;
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.1s;
    }
    .result-row:hover { background: rgba(255,255,255,0.05); }
    .result-cover {
      flex-shrink: 0;
      width: 44px;
      height: 66px;
      border-radius: 3px;
      overflow: hidden;
      background: #0f172a;
    }
    .result-cover-img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .result-cover-placeholder {
      width: 100%; height: 100%;
      display: flex; align-items: center; justify-content: center;
    }
    .result-cover-placeholder mat-icon { font-size: 1.25rem; width: 1.25rem; height: 1.25rem; color: #334155; }
    .result-info { flex: 1; min-width: 0; }
    .result-title {
      font-size: 0.85rem; font-weight: 600; color: #e2e8f0;
      margin: 0 0 0.15rem; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
    }
    .result-author {
      font-size: 0.75rem; color: #94a3b8; margin: 0 0 0.1rem;
      overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
    }
    .result-meta { font-size: 0.7rem; color: #475569; margin: 0; display: flex; gap: 0.3rem; }
    .result-arrow { color: #334155; flex-shrink: 0; }
    .manual-link-row {
      display: flex;
      justify-content: center;
      margin-top: 0.75rem;
      border-top: 1px solid rgba(255,255,255,0.05);
      padding-top: 0.75rem;
    }
    .manual-link-btn { color: #475569 !important; font-size: 0.78rem; }
    .manual-link-btn:hover { color: #a78bfa !important; }
    .manual-link-btn mat-icon { font-size: 1rem; width: 1rem; height: 1rem; margin-right: 0.25rem; }
    .form-header {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      margin-bottom: 0.5rem;
    }
    .form-header .dialog-title { margin: 0; }
    .back-btn { color: #64748b !important; margin-left: -0.5rem; }
    .error-msg { color: #f87171; font-size: 0.78rem; margin: 0 0 0.75rem; }
    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
      margin-top: 0.5rem;
    }
    </style>
  `,
})
export class AddUpcomingDialogComponent implements OnInit, OnDestroy {
  step: 'search' | 'form' = 'search';
  fromSearch = false;

  query = '';
  results: BookSearchResult[] = [];
  searching = false;

  form = { title: '', author_name: '', release_date: '', isbn: '', cover_url: '', notes: '' };
  saving = false;
  error: string | null = null;

  private search$ = new Subject<string>();
  private destroy$ = new Subject<void>();

  constructor(
    private dialogRef: MatDialogRef<AddUpcomingDialogComponent>,
    private searchService: SearchService,
    private upcomingService: UpcomingService,
  ) {}

  ngOnInit(): void {
    this.search$.pipe(
      debounceTime(350),
      distinctUntilChanged(),
      switchMap(q => {
        if (q.trim().length < 2) {
          this.results = [];
          return of([] as BookSearchResult[]);
        }
        this.searching = true;
        return this.searchService.searchBooks(q).pipe(
          catchError(() => of([] as BookSearchResult[])),
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

  pickResult(book: BookSearchResult): void {
    this.fromSearch = true;
    this.form = {
      title: book.title,
      author_name: book.authors.join(', '),
      release_date: this.toDateInput(book.published_at),
      isbn: book.isbn13 || book.isbn || '',
      cover_url: book.cover_url || '',
      notes: '',
    };
    this.error = null;
    this.step = 'form';
  }

  enterManual(): void {
    this.fromSearch = false;
    this.form = { title: '', author_name: '', release_date: '', isbn: '', cover_url: '', notes: '' };
    this.error = null;
    this.step = 'form';
  }

  save(): void {
    if (!this.form.title.trim() || this.saving) return;
    this.saving = true;
    this.error = null;
    this.upcomingService.add({
      title: this.form.title.trim(),
      author_name: this.form.author_name.trim() || null,
      release_date: this.form.release_date || null,
      isbn: this.form.isbn.trim() || null,
      cover_url: this.form.cover_url.trim() || null,
      notes: this.form.notes.trim() || null,
    }).subscribe({
      next: (release: UpcomingRelease) => {
        this.saving = false;
        this.dialogRef.close(release);
      },
      error: () => {
        this.saving = false;
        this.error = 'Failed to add release. Please try again.';
      },
    });
  }

  private toDateInput(dt: string | null): string {
    if (!dt) return '';
    if (/^\d{4}$/.test(dt)) return `${dt}-01-01`;
    if (/^\d{4}-\d{2}$/.test(dt)) return `${dt}-01`;
    return dt.slice(0, 10);
  }
}
