import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { SeriesService } from '../../core/services/series.service';
import { BookService } from '../../core/services/book.service';
import type { SeriesWithBooks, BookWithDetails } from '../../types/schema.types';
import { forkJoin } from 'rxjs';

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
    MatProgressSpinnerModule, MatChipsModule,
  ],
  templateUrl: './series-tracker.component.html',
})
export class SeriesTrackerComponent implements OnInit {
  seriesList: EnrichedSeries[] = [];
  loading = true;

  constructor(
    private seriesService: SeriesService,
    private bookService: BookService,
  ) {}

  ngOnInit(): void {
    forkJoin({
      series: this.seriesService.getSeries(),
      books:  this.bookService.getBooks(),
    }).subscribe({
      next: ({ series, books }) => {
        const readSet = new Set(
          books
            .filter(b => b.user_book?.status === 'read')
            .map(b => b.id)
        );

        this.seriesList = series.map(s => {
          const readCount = s.books.filter(b => readSet.has(b.id)).length;
          return {
            ...s,
            readCount,
            progress: s.books.length ? Math.round((readCount / s.books.length) * 100) : 0,
          };
        });

        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  bookStatus(bookId: number, allBooks: BookWithDetails[]): string {
    const b = allBooks.find(x => x.id === bookId);
    return b?.user_book?.status ?? '';
  }
}
