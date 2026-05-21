import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthorService } from '../../../core/services/author.service';
import { ClaudeService } from '../../../core/services/claude.service';
import type { AuthorWithBooks, BookWithDetails, ReadingStatus } from '../../../types/schema.types';

@Component({
  selector: 'app-book-detail',
  standalone: true,
  imports: [
    CommonModule, DatePipe,
    MatDialogModule, MatIconModule, MatButtonModule,
    MatProgressSpinnerModule, MatTooltipModule,
  ],
  templateUrl: './book-detail.component.html',
})
export class BookDetailComponent implements OnInit {
  authorDetails: AuthorWithBooks[] = [];
  summaryText: string | null = null;
  summaryLoading = false;

  readonly statusLabels: Record<ReadingStatus, string> = {
    'reading': 'Reading', 'want-to-read': 'Want to Read', 'read': 'Read', 'dnf': 'DNF',
  };

  constructor(
    @Inject(MAT_DIALOG_DATA) public book: BookWithDetails,
    private dialogRef: MatDialogRef<BookDetailComponent>,
    private authorService: AuthorService,
    private claude: ClaudeService,
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

    // Use stored summary if available
    if (this.book.ai_summary) {
      this.summaryText = this.book.ai_summary;
    }
  }

  generateSummary(): void {
    this.summaryLoading = true;
    this.claude.getBookSummary(this.book.id).subscribe({
      next: res => {
        this.summaryText = res.summary;
        this.summaryLoading = false;
        // Update local copy so it survives re-opens in same session
        (this.book as BookWithDetails & { ai_summary: string }).ai_summary = res.summary;
      },
      error: () => {
        this.summaryText = 'Unable to generate summary right now.';
        this.summaryLoading = false;
      },
    });
  }

  otherBooks(author: AuthorWithBooks) {
    return author.books.filter(b => b.id !== this.book.id);
  }

  stars(): number[] {
    return Array.from({ length: this.book.user_book?.rating ?? 0 });
  }

  statusClass(): string {
    return this.book.user_book ? `status-${this.book.user_book.status}` : 'status-none';
  }

  statusLabel(): string {
    return this.book.user_book ? this.statusLabels[this.book.user_book.status] : 'Not on shelf';
  }

  close(): void {
    this.dialogRef.close();
  }
}
