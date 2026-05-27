import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog } from '@angular/material/dialog';
import { MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonModule } from '@angular/material/button';
import { forkJoin } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { BookService } from '../../core/services/book.service';
import { SeriesService } from '../../core/services/series.service';
import { UpcomingService } from '../../core/services/upcoming.service';
import { AuthService } from '../../core/services/auth.service';
import { BookDetailComponent } from '../library/book-detail/book-detail.component';
import type { BookWithDetails, SeriesWithBooks, UpcomingRelease } from '../../types/schema.types';

interface DashSeries {
  id: number;
  name: string;
  subline: string;
  statusLabel: string;
  statusClass: string;
}

interface GenreBar {
  label: string;
  count: number;
  pct: number;
}

const GENRE_COLORS = ['#60a5fa','#c084fc','#4ade80','#fb923c','#f87171','#2dd4bf','#facc15'];

interface TopPick {
  key:       string;
  title:     string;
  author:    string;
  cover_url: string | null;
  genre:     string;
}

interface GenreOption { label: string; subject: string }

const DEFAULT_SUBJECTS = ['science_fiction', 'fantasy'];
const PICKS_STORAGE_KEY = 'sfs_toppick_genres';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, DatePipe, RouterLink, MatDialogModule, MatIconModule, MatProgressSpinnerModule, MatTooltipModule, MatButtonModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit {
  loading = true;
  readonly today = new Date();

  totalBooks   = 0;
  readCount    = 0;
  readingCount = 0;
  seriesCount  = 0;

  nowReading:       BookWithDetails | null = null;
  otherReading:     BookWithDetails[]     = [];
  seriesList:       DashSeries[]          = [];
  recentlyRead:     BookWithDetails[]     = [];
  genreBars:        GenreBar[]            = [];
  upcomingReleases: UpcomingRelease[]     = [];
  topPicks:         TopPick[]            = [];
  topPicksLoading   = true;
  genreOptions:     GenreOption[]        = [];
  selectedSubjects: string[]             = DEFAULT_SUBJECTS;
  showGenrePicker   = false;

  constructor(
    private bookService:     BookService,
    private seriesService:   SeriesService,
    private upcomingService: UpcomingService,
    private http:            HttpClient,
    private dialog:          MatDialog,
    public  auth:            AuthService,
  ) {}

  ngOnInit(): void {
    this.loadData();

    const saved = localStorage.getItem(PICKS_STORAGE_KEY);
    if (saved) {
      try { this.selectedSubjects = JSON.parse(saved); } catch { /* ignore */ }
    }

    this.http.get<GenreOption[]>('/api/toppicks/genres').subscribe({
      next: opts => { this.genreOptions = opts; },
    });

    this.loadTopPicks();
  }

  loadTopPicks(): void {
    this.topPicksLoading = true;
    const params = this.selectedSubjects.join(',');
    this.http.get<TopPick[]>(`/api/toppicks?subjects=${params}`).subscribe({
      next:  picks => { this.topPicks = picks; this.topPicksLoading = false; },
      error: ()    => { this.topPicksLoading = false; },
    });
  }

  toggleGenre(subject: string): void {
    const idx = this.selectedSubjects.indexOf(subject);
    if (idx >= 0) {
      if (this.selectedSubjects.length === 1) return; // keep at least 1
      this.selectedSubjects = this.selectedSubjects.filter(s => s !== subject);
    } else {
      if (this.selectedSubjects.length >= 3) return; // max 3
      this.selectedSubjects = [...this.selectedSubjects, subject];
    }
    localStorage.setItem(PICKS_STORAGE_KEY, JSON.stringify(this.selectedSubjects));
    this.loadTopPicks();
  }

  isGenreSelected(subject: string): boolean {
    return this.selectedSubjects.includes(subject);
  }

  private loadData(): void {
    forkJoin({
      books:    this.bookService.getAllBooks(),
      series:   this.seriesService.getSeries(),
      upcoming: this.upcomingService.getAll(),
    }).subscribe({
      next: ({ books, series, upcoming }) => {
        this.compute(books, series);
        const now = new Date().toISOString().slice(0, 10);
        this.upcomingReleases = upcoming
          .filter(r => !r.release_date || r.release_date >= now)
          .sort((a, b) => (a.release_date ?? 'zzzz').localeCompare(b.release_date ?? 'zzzz'))
          .slice(0, 4);
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  private compute(books: BookWithDetails[], series: SeriesWithBooks[]): void {
    this.totalBooks   = books.length;
    this.readCount    = books.filter(b => b.user_book?.status === 'read').length;
    this.readingCount = books.filter(b => b.user_book?.status === 'reading').length;
    this.seriesCount  = series.length;

    const reading = books.filter(b => b.user_book?.status === 'reading');
    this.nowReading   = reading.find(b => b.user_book?.featured) ?? reading[0] ?? null;
    this.otherReading = reading.filter(b => b !== this.nowReading);

    this.recentlyRead = books
      .filter(b => b.user_book?.status === 'read')
      .sort((a, b) => {
        const da = a.user_book?.finished_at ?? a.user_book?.updated_at ?? '';
        const db = b.user_book?.finished_at ?? b.user_book?.updated_at ?? '';
        return db.localeCompare(da);
      })
      .slice(0, 5);

    const bookMap = new Map(books.map(b => [b.id, b]));
    this.seriesList = series.map(s => {
      const userBooks  = s.books.map(b => bookMap.get(b.id));
      const readCount  = userBooks.filter(b => b?.user_book?.status === 'read').length;
      const total      = s.books.length;
      const authorName = userBooks.find(b => b?.authors.length)?.authors[0]?.name ?? '';

      const subParts = [authorName];
      if (total) subParts.push(`Book ${readCount} of ${total}`);
      const subline = subParts.filter(Boolean).join(' · ');

      let statusLabel: string;
      let statusClass: string;
      if (total > 0 && readCount === total) {
        statusLabel = 'Complete'; statusClass = 'badge-complete';
      } else if (readCount > 0 || userBooks.some(b => b?.user_book?.status === 'reading')) {
        statusLabel = 'In Progress'; statusClass = 'badge-inprogress';
      } else {
        statusLabel = 'Want to Read'; statusClass = 'badge-want';
      }

      return { id: s.id, name: s.name, subline, statusLabel, statusClass };
    })
    .filter(s => s.statusLabel !== 'Complete')
    .slice(0, 10);

    const tagMap = new Map<string, { display: string; count: number }>();
    books.forEach(b => b.tags.forEach(t => {
      const key = t.name.trim().toLowerCase();
      const entry = tagMap.get(key);
      if (entry) entry.count++;
      else tagMap.set(key, { display: t.name.trim(), count: 1 });
    }));
    const sorted = [...tagMap.values()].sort((a, b) => b.count - a.count);
    const max = sorted[0]?.count ?? 1;
    this.genreBars = sorted.map(({ display, count }) => ({
      label: display, count, pct: Math.round((count / max) * 100),
    }));
  }

  openBook(book: BookWithDetails): void {
    const ref = this.dialog.open(BookDetailComponent, {
      data: book,
      panelClass: 'book-detail-panel',
      maxWidth: '100vw',
    });
    ref.afterClosed().subscribe((result: BookWithDetails | { deleted: true; id: number } | undefined) => {
      if (result) this.loadData();
    });
  }

  pinBook(event: Event, book: BookWithDetails): void {
    event.stopPropagation();
    this.bookService.setFeaturedBook(book.id).subscribe(() => this.loadData());
  }

  pickUrl(pick: TopPick): string {
    if (pick.key.startsWith('/works/')) {
      return `https://openlibrary.org${pick.key}`;
    }
    return `https://openlibrary.org/search?q=${encodeURIComponent(pick.title + ' ' + pick.author)}`;
  }

  authorNames(book: BookWithDetails): string {
    return book.authors.map(a => a.name).join(', ');
  }

  stars(rating: number | null | undefined): string {
    if (!rating) return '';
    return '★'.repeat(rating) + '☆'.repeat(5 - rating);
  }

  get dayLabel(): string {
    return this.today.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    }).toUpperCase();
  }

  genreColor(index: number): string {
    return GENRE_COLORS[index % GENRE_COLORS.length];
  }

  get nowSummary(): string {
    if (!this.nowReading) return '';
    const text = this.nowReading.ai_summary || this.nowReading.description || '';
    return text.length > 300 ? text.slice(0, 300) + '…' : text;
  }
}
