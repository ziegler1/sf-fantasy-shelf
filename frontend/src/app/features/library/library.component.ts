import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDialog } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { BookService } from '../../core/services/book.service';
import { BookDetailComponent } from './book-detail/book-detail.component';
import { AddBookComponent } from './add-book/add-book.component';
import type { BookWithDetails, ReadingStatus } from '../../types/schema.types';

interface StatusFilter {
  label: string;
  value: ReadingStatus | '';
}

@Component({
  selector: 'app-library',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatCardModule, MatChipsModule, MatIconModule,
    MatButtonModule, MatProgressSpinnerModule, MatTooltipModule,
    MatFormFieldModule, MatInputModule,
  ],
  templateUrl: './library.component.html',
})
export class LibraryComponent implements OnInit, OnDestroy {
  books: BookWithDetails[] = [];
  loading = true;
  activeStatus: ReadingStatus | '' = '';
  searchQuery = '';

  readonly PAGE_SIZE = 48;
  page = 0;
  total = 0;

  readonly filters: StatusFilter[] = [
    { label: 'All',           value: ''            },
    { label: 'Reading',       value: 'reading'     },
    { label: 'Want to Read',  value: 'want-to-read'},
    { label: 'Read',          value: 'read'        },
    { label: 'DNF',           value: 'dnf'         },
  ];

  private search$ = new Subject<string>();
  private destroy$ = new Subject<void>();

  constructor(
    private bookService: BookService,
    private dialog: MatDialog,
  ) {}

  ngOnInit(): void {
    this.load();

    this.search$.pipe(
      debounceTime(350),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe(() => this.load());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSearchChange(q: string): void {
    this.searchQuery = q;
    this.page = 0;
    this.search$.next(q);
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.page = 0;
    this.load();
  }

  setFilter(value: ReadingStatus | ''): void {
    if (this.activeStatus === value) return;
    this.activeStatus = value;
    this.page = 0;
    this.load();
  }

  load(): void {
    this.loading = true;
    const filters: { status?: ReadingStatus; search?: string; limit: number; offset: number } = {
      limit: this.PAGE_SIZE,
      offset: this.page * this.PAGE_SIZE,
    };
    if (this.activeStatus) filters.status = this.activeStatus as ReadingStatus;
    if (this.searchQuery.trim()) filters.search = this.searchQuery.trim();

    this.bookService.getBooks(filters).subscribe({
      next: ({ books, total }) => { this.books = books; this.total = total; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  get totalPages(): number { return Math.ceil(this.total / this.PAGE_SIZE); }

  prevPage(): void {
    if (this.page > 0) { this.page--; this.load(); }
  }

  nextPage(): void {
    if (this.page < this.totalPages - 1) { this.page++; this.load(); }
  }

  openDetail(book: BookWithDetails): void {
    const ref = this.dialog.open(BookDetailComponent, {
      data: book,
      panelClass: 'book-detail-panel',
      maxWidth: '100vw',
    });
    ref.afterClosed().subscribe((result: BookWithDetails | { deleted: true; id: number } | undefined) => {
      if (!result) return;
      if ('deleted' in result) {
        this.books = this.books.filter(b => b.id !== result.id);
      } else {
        const idx = this.books.findIndex(b => b.id === result.id);
        if (idx !== -1) this.books[idx] = result;
      }
    });
  }

  openAddBook(): void {
    const ref = this.dialog.open(AddBookComponent, {
      panelClass: 'book-detail-panel',
      maxWidth: '100vw',
    });
    ref.afterClosed().subscribe((newBook: BookWithDetails | undefined) => {
      if (newBook) this.load();
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
