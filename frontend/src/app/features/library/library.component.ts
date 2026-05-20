import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BookService } from '../../core/services/book.service';
import { ClaudeService } from '../../core/services/claude.service';
import type { BookWithDetails, ReadingStatus } from '../../types/schema.types';

interface StatusFilter {
  label: string;
  value: ReadingStatus | '';
}

interface SummaryState {
  loading: boolean;
  text: string | null;
  open: boolean;
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
  summaries = new Map<number, SummaryState>();

  readonly filters: StatusFilter[] = [
    { label: 'All',           value: ''            },
    { label: 'Reading',       value: 'reading'     },
    { label: 'Want to Read',  value: 'want-to-read'},
    { label: 'Read',          value: 'read'        },
    { label: 'DNF',           value: 'dnf'         },
  ];

  constructor(
    private bookService: BookService,
    private claude: ClaudeService,
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

  toggleSummary(book: BookWithDetails): void {
    const state = this.summaries.get(book.id);

    if (state) {
      this.summaries.set(book.id, { ...state, open: !state.open });
      if (!state.text && !state.loading && !state.open) {
        this.fetchSummary(book.id);
      }
      return;
    }

    this.summaries.set(book.id, { loading: true, text: null, open: true });
    this.fetchSummary(book.id);
  }

  private fetchSummary(bookId: number): void {
    this.claude.getBookSummary(bookId).subscribe({
      next: res => this.summaries.set(bookId, { loading: false, text: res.summary, open: true }),
      error: () => this.summaries.set(bookId, {
        loading: false,
        text: 'Unable to generate summary right now.',
        open: true,
      }),
    });
  }

  summaryState(bookId: number): SummaryState {
    return this.summaries.get(bookId) ?? { loading: false, text: null, open: false };
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
