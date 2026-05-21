import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { BookService } from '../../core/services/book.service';
import { BookDetailComponent } from './book-detail/book-detail.component';
import type { BookWithDetails, ReadingStatus } from '../../types/schema.types';

interface StatusFilter {
  label: string;
  value: ReadingStatus | '';
}

@Component({
  selector: 'app-library',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule, MatChipsModule, MatIconModule,
    MatButtonModule, MatProgressSpinnerModule, MatTooltipModule,
  ],
  templateUrl: './library.component.html',
})
export class LibraryComponent implements OnInit {
  books: BookWithDetails[] = [];
  loading = true;
  activeStatus: ReadingStatus | '' = '';

  readonly filters: StatusFilter[] = [
    { label: 'All',           value: ''            },
    { label: 'Reading',       value: 'reading'     },
    { label: 'Want to Read',  value: 'want-to-read'},
    { label: 'Read',          value: 'read'        },
    { label: 'DNF',           value: 'dnf'         },
  ];

  constructor(
    private bookService: BookService,
    private dialog: MatDialog,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  setFilter(value: ReadingStatus | ''): void {
    if (this.activeStatus === value) return;
    this.activeStatus = value;
    this.load();
  }

  load(): void {
    this.loading = true;
    const filters = this.activeStatus ? { status: this.activeStatus as ReadingStatus } : undefined;
    this.bookService.getBooks(filters).subscribe({
      next: books => { this.books = books; this.loading = false; },
      error: ()    => { this.loading = false; },
    });
  }

  openDetail(book: BookWithDetails): void {
    this.dialog.open(BookDetailComponent, {
      data: book,
      panelClass: 'book-detail-panel',
      maxWidth: '100vw',
    });
  }

  authorNames(book: BookWithDetails): string {
    return book.authors.map(a => a.name).join(', ') || 'Unknown Author';
  }

  statusClass(book: BookWithDetails): string {
    return book.user_book ? `status-${book.user_book.status}` : 'status-none';
  }

  statusLabel(book: BookWithDetails): string {
    const map: Record<ReadingStatus, string> = {
      'reading': 'Reading', 'want-to-read': 'Want to Read', 'read': 'Read', 'dnf': 'DNF',
    };
    return book.user_book ? map[book.user_book.status] : 'Not on shelf';
  }

  stars(book: BookWithDetails): number[] {
    return Array.from({ length: book.user_book?.rating ?? 0 });
  }
}
