import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthorService } from '../../../core/services/author.service';
import { ClaudeService } from '../../../core/services/claude.service';
import { BookService } from '../../../core/services/book.service';
import type { AuthorWithBooks, BookWithDetails, ReadingStatus, UserBook } from '../../../types/schema.types';

@Component({
  selector: 'app-book-detail',
  standalone: true,
  imports: [
    CommonModule, DatePipe, FormsModule,
    MatDialogModule, MatIconModule, MatButtonModule,
    MatProgressSpinnerModule, MatTooltipModule,
    MatSelectModule, MatFormFieldModule,
  ],
  templateUrl: './book-detail.component.html',
})
export class BookDetailComponent implements OnInit {
  authorDetails: AuthorWithBooks[] = [];
  summaryText: string | null = null;
  summaryLoading = false;

  // Shelf editing state — mirrors book.user_book but mutable
  editStatus: ReadingStatus | '' = '';
  editRating: 0 | 1 | 2 | 3 | 4 | 5 = 0;
  shelfSaving = false;
  private dirty = false;

  readonly statusOptions: { label: string; value: ReadingStatus | '' }[] = [
    { label: 'Not on shelf',  value: '' },
    { label: 'Want to Read',  value: 'want-to-read' },
    { label: 'Reading',       value: 'reading' },
    { label: 'Read',          value: 'read' },
    { label: 'DNF',           value: 'dnf' },
  ];

  readonly statusLabels: Record<ReadingStatus, string> = {
    'reading': 'Reading', 'want-to-read': 'Want to Read', 'read': 'Read', 'dnf': 'DNF',
  };

  constructor(
    @Inject(MAT_DIALOG_DATA) public book: BookWithDetails,
    private dialogRef: MatDialogRef<BookDetailComponent>,
    private authorService: AuthorService,
    private claude: ClaudeService,
    private bookService: BookService,
  ) {}

  ngOnInit(): void {
    // Pre-load author details for "other books" section
    if (this.book.authors.length) {
      const calls = this.book.authors.map(a =>
        this.authorService.getAuthor(a.id).pipe(catchError(() => of(null))),
      );
      forkJoin(calls).subscribe(results => {
        this.authorDetails = results.filter((r): r is AuthorWithBooks => r !== null);
      });
    }

    if (this.book.ai_summary) this.summaryText = this.book.ai_summary;

    // Seed edit state from current user_book
    this.editStatus = (this.book.user_book?.status ?? '') as ReadingStatus | '';
    this.editRating = (this.book.user_book?.rating ?? 0) as 0 | 1 | 2 | 3 | 4 | 5;
  }

  generateSummary(): void {
    this.summaryLoading = true;
    this.claude.getBookSummary(this.book.id).subscribe({
      next: res => {
        this.summaryText = res.summary;
        this.summaryLoading = false;
        this.book.ai_summary = res.summary;
      },
      error: () => {
        this.summaryText = 'Unable to generate summary right now.';
        this.summaryLoading = false;
      },
    });
  }

  onStatusChange(value: ReadingStatus | ''): void {
    this.editStatus = value;
    this.saveShelf();
  }

  setRating(n: 1 | 2 | 3 | 4 | 5): void {
    // Clicking the same star again clears the rating
    this.editRating = this.editRating === n ? 0 : n;
    this.saveShelf();
  }

  private saveShelf(): void {
    if (this.shelfSaving) return;
    this.dirty = true;
    this.shelfSaving = true;

    if (!this.editStatus) {
      // Remove from shelf
      this.bookService.removeFromShelf(this.book.id).subscribe({
        next: () => {
          this.book.user_book = null;
          this.editRating = 0;
          this.shelfSaving = false;
        },
        error: () => { this.shelfSaving = false; },
      });
      return;
    }

    this.bookService.updateShelf(this.book.id, {
      status: this.editStatus as ReadingStatus,
      rating: this.editRating || null,
    }).subscribe({
      next: (ub: UserBook) => {
        this.book.user_book = ub;
        this.shelfSaving = false;
      },
      error: () => { this.shelfSaving = false; },
    });
  }

  otherBooks(author: AuthorWithBooks) {
    return author.books.filter(b => b.id !== this.book.id);
  }

  starRange = [1, 2, 3, 4, 5] as const;

  statusClass(): string {
    return this.editStatus ? `status-${this.editStatus}` : 'status-none';
  }

  close(): void {
    this.dialogRef.close(this.dirty ? this.book : undefined);
  }
}
