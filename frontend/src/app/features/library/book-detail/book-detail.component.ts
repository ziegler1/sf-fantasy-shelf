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
import { MatInputModule } from '@angular/material/input';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthorService } from '../../../core/services/author.service';
import { ClaudeService } from '../../../core/services/claude.service';
import { BookService } from '../../../core/services/book.service';
import type { AuthorWithBooks, Book, BookWithDetails, ReadingStatus, UserBook } from '../../../types/schema.types';

@Component({
  selector: 'app-book-detail',
  standalone: true,
  imports: [
    CommonModule, DatePipe, FormsModule,
    MatDialogModule, MatIconModule, MatButtonModule,
    MatProgressSpinnerModule, MatTooltipModule,
    MatSelectModule, MatFormFieldModule, MatInputModule,
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
  deleteConfirm = false;
  deleting = false;
  private dirty = false;

  // Metadata editing state
  editMode = false;
  metaForm = { title: '', description: '', year: '', page_count: '', isbn13: '', cover_url: '' };
  editAuthors = '';
  editTags = '';
  metaSaving = false;

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

  enterEditMode(): void {
    const y = this.book.published_at
      ? new Date(this.book.published_at).getUTCFullYear()
      : null;
    this.metaForm = {
      title:       this.book.title,
      description: this.book.description ?? '',
      year:        y != null ? String(y) : '',
      page_count:  this.book.page_count != null ? String(this.book.page_count) : '',
      isbn13:      this.book.isbn13 ?? '',
      cover_url:   this.book.cover_url ?? '',
    };
    this.editAuthors = this.book.authors.map(a => a.name).join(', ');
    this.editTags    = this.book.tags.map(t => t.name).join(', ');
    this.editMode = true;
  }

  cancelEdit(): void {
    this.editMode = false;
  }

  saveMetadata(): void {
    this.metaSaving = true;
    const year = parseInt(this.metaForm.year, 10);
    const bookPayload: Partial<Book> = {
      title:        this.metaForm.title,
      description:  this.metaForm.description || null,
      page_count:   this.metaForm.page_count ? parseInt(this.metaForm.page_count, 10) : null,
      published_at: !isNaN(year) ? `${year}-01-01` : null,
      isbn13:       this.metaForm.isbn13 || null,
      isbn:         this.book.isbn,
      cover_url:    this.toImageUrl(this.metaForm.cover_url.trim() || null),
      language:     this.book.language,
    };
    const authorNames = this.editAuthors.split(',').map(a => a.trim()).filter(Boolean);
    const tagNames    = this.editTags.split(',').map(t => t.trim()).filter(Boolean);

    forkJoin({
      book:    this.bookService.updateBook(this.book.id, bookPayload),
      authors: this.bookService.updateBookAuthors(this.book.id, authorNames),
      tags:    this.bookService.updateBookTags(this.book.id, tagNames),
    }).subscribe({
      next: ({ book, authors, tags }) => {
        this.book.title        = book.title;
        this.book.description  = book.description;
        this.book.page_count   = book.page_count;
        this.book.published_at = book.published_at;
        this.book.isbn13       = book.isbn13;
        this.book.cover_url    = book.cover_url;
        this.book.authors      = authors;
        this.book.tags         = tags;
        this.dirty = true;
        this.editMode = false;
        this.metaSaving = false;
      },
      error: () => { this.metaSaving = false; },
    });
  }

  otherBooks(author: AuthorWithBooks) {
    return author.books.filter(b => b.id !== this.book.id);
  }

  starRange = [1, 2, 3, 4, 5] as const;

  statusClass(): string {
    return this.editStatus ? `status-${this.editStatus}` : 'status-none';
  }

  confirmDelete(): void {
    this.deleteConfirm = true;
  }

  deleteBook(): void {
    this.deleting = true;
    this.bookService.deleteBook(this.book.id).subscribe({
      next: () => this.dialogRef.close({ deleted: true, id: this.book.id }),
      error: () => { this.deleting = false; this.deleteConfirm = false; },
    });
  }

  close(): void {
    this.dialogRef.close(this.dirty ? this.book : undefined);
  }

  private toImageUrl(url: string | null): string | null {
    if (!url) return null;
    const s = url.replace(/^http:\/\//, 'https://');
    const m = s.match(/books\.google\.com\/books\?[^"]*[?&]id=([^&\s"]+)/);
    if (m) return `https://books.google.com/books/content?id=${m[1]}&printsec=frontcover&img=1&zoom=1`;
    return s;
  }
}
