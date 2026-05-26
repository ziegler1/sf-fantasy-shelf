import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ClaudeService, BookRecommendation, AuthorSuggestion } from '../../core/services/claude.service';
import { AuthorService } from '../../core/services/author.service';
import { RestoreAuthorDialogComponent } from './restore-author-dialog.component';
import type { Author } from '../../types/schema.types';

const RECS_STORAGE_KEY    = 'sfs_recommendations';
const HIDDEN_AUTHORS_KEY  = 'sfs_hidden_author_ids';

interface StoredRecs {
  recommendations: BookRecommendation[];
  message: string;
  fetchedAt: string;
}

@Component({
  selector: 'app-discover',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatCardModule, MatButtonModule, MatIconModule,
    MatProgressSpinnerModule, MatSelectModule, MatFormFieldModule, MatTooltipModule,
    MatDialogModule,
  ],
  templateUrl: './discover.component.html',
  styleUrl: './discover.component.css',
})

export class DiscoverComponent implements OnInit {
  // Next-up recommendations
  recommendations: BookRecommendation[] = [];
  recsLoading = false;
  recsError = false;
  recsMessage = '';
  recsFetchedAt: string | null = null;
  recsReady = false;   // true once we have something to show (from cache or fresh fetch)

  // Similar-authors
  authors: Author[] = [];
  selectedAuthorId: number | null = null;
  suggestions: AuthorSuggestion[] = [];
  suggestionsLoading = false;
  suggestionsError = false;
  suggestionsAuthorName = '';
  hiddenAuthorIds = new Set<number>();
  showHidden = false;

  // Swipe-to-dismiss state for suggestion cards
  readonly swipeX      = new Map<string, number>();
  readonly swipingIds  = new Set<string>();
  readonly flyingOut   = new Set<string>();
  private readonly swipeMoved    = new Set<string>();
  private readonly pointerStates = new Map<number, {
    name: string; startX: number; startY: number; locked: boolean;
  }>();
  private static readonly SWIPE_THRESHOLD = 80;

  constructor(
    private claude: ClaudeService,
    private authorService: AuthorService,
    private dialog: MatDialog,
  ) {}

  ngOnInit(): void {
    try {
      const stored = localStorage.getItem(RECS_STORAGE_KEY);
      if (stored) {
        const parsed: StoredRecs = JSON.parse(stored);
        this.recommendations = parsed.recommendations ?? [];
        this.recsMessage     = parsed.message ?? '';
        this.recsFetchedAt   = parsed.fetchedAt ?? null;
        this.recsReady = true;
      }
    } catch { /* ignore corrupt cache */ }

    try {
      const hidden = localStorage.getItem(HIDDEN_AUTHORS_KEY);
      if (hidden) this.hiddenAuthorIds = new Set(JSON.parse(hidden) as number[]);
    } catch { /* ignore */ }

    this.authorService.getAuthors().subscribe({
      next: authors => { this.authors = authors; },
    });
  }

  loadRecommendations(): void {
    this.recsLoading = true;
    this.recsError = false;

    this.claude.getNextRecommendations().subscribe({
      next: res => {
        this.recommendations = res.recommendations ?? [];
        this.recsMessage     = res.message ?? '';
        this.recsFetchedAt   = new Date().toLocaleString();
        this.recsReady = true;
        this.recsLoading = false;

        // Persist so navigating away and back doesn't re-fetch
        const payload: StoredRecs = {
          recommendations: this.recommendations,
          message:         this.recsMessage,
          fetchedAt:       this.recsFetchedAt,
        };
        try { localStorage.setItem(RECS_STORAGE_KEY, JSON.stringify(payload)); } catch { /* ignore */ }
      },
      error: () => {
        this.recsError = true;
        this.recsLoading = false;
      },
    });
  }

  get selectedAuthorName(): string {
    return this.deduplicatedAuthors.find(a => a.id === this.selectedAuthorId)?.name ?? '';
  }

  get deduplicatedAuthors(): Author[] {
    const seen = new Map<string, Author>();
    for (const a of this.authors) {
      if (!this.showHidden && this.hiddenAuthorIds.has(a.id)) continue;
      const key = a.name.replace(/\.\s+(?=[A-Za-z])/g, '.').toLowerCase().trim();
      if (!seen.has(key)) seen.set(key, a);
    }
    return [...seen.values()];
  }

  get hiddenCount(): number { return this.hiddenAuthorIds.size; }

  hideAuthor(id: number, event: Event): void {
    event.stopPropagation();
    this.hiddenAuthorIds.add(id);
    if (this.selectedAuthorId === id) this.selectedAuthorId = null;
    this.saveHidden();
  }

  unhideAuthor(id: number, event: Event): void {
    event.stopPropagation();
    this.hiddenAuthorIds.delete(id);
    this.saveHidden();
  }

  private saveHidden(): void {
    try {
      localStorage.setItem(HIDDEN_AUTHORS_KEY, JSON.stringify([...this.hiddenAuthorIds]));
    } catch { /* ignore */ }
  }

  bookUrl(rec: BookRecommendation): string {
    if (rec.url) return rec.url;
    return `https://www.goodreads.com/search?q=${encodeURIComponent(rec.title + ' ' + rec.author)}`;
  }

  authorUrl(s: AuthorSuggestion): string {
    if (s.url) return s.url;
    return `https://www.goodreads.com/search?q=${encodeURIComponent(s.name)}&search_type=author`;
  }

  openRestoreDialog(): void {
    const ref = this.dialog.open(RestoreAuthorDialogComponent, { maxWidth: '100vw' });
    ref.afterClosed().subscribe(restored => {
      if (restored) {
        this.authorService.getAuthors().subscribe({ next: authors => { this.authors = authors; } });
      }
    });
  }

  dismissSuggestion(name: string): void {
    this.suggestions = this.suggestions.filter(s => s.name !== name);
    this.flyingOut.delete(name);
    this.swipeMoved.delete(name);
  }

  onSwipeStart(name: string, event: PointerEvent): void {
    if ((event.target as HTMLElement).closest('a')) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.pointerStates.set(event.pointerId, {
      name, startX: event.clientX, startY: event.clientY, locked: false,
    });
  }

  onSwipeMove(name: string, event: PointerEvent): void {
    const state = this.pointerStates.get(event.pointerId);
    if (!state) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (!state.locked) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (Math.abs(dy) > Math.abs(dx)) { this.pointerStates.delete(event.pointerId); return; }
      state.locked = true;
      this.swipingIds.add(name);
    }
    event.preventDefault();
    this.swipeX.set(name, Math.min(0, dx));
  }

  onSwipeEnd(name: string, event: PointerEvent): void {
    const state = this.pointerStates.get(event.pointerId);
    this.pointerStates.delete(event.pointerId);
    this.swipingIds.delete(name);
    if (!state?.locked) return;
    const dx = event.clientX - state.startX;
    this.swipeMoved.add(name);
    if (dx < -DiscoverComponent.SWIPE_THRESHOLD) {
      this.flyingOut.add(name);
      this.swipeX.delete(name);
      setTimeout(() => this.dismissSuggestion(name), 300);
    } else {
      this.swipeX.set(name, 0);
      setTimeout(() => { this.swipeX.delete(name); this.swipeMoved.delete(name); }, 250);
    }
  }

  onSwipeCancel(name: string, event: PointerEvent): void {
    this.pointerStates.delete(event.pointerId);
    this.swipingIds.delete(name);
    this.swipeX.set(name, 0);
    setTimeout(() => this.swipeX.delete(name), 250);
  }

  loadSimilarAuthors(): void {
    if (!this.selectedAuthorId) return;

    const author = this.authors.find(a => a.id === this.selectedAuthorId);
    this.suggestionsAuthorName = author?.name ?? '';
    this.suggestionsLoading = true;
    this.suggestionsError = false;
    this.suggestions = [];

    this.claude.getSimilarAuthors(this.selectedAuthorId).subscribe({
      next: res => {
        this.suggestions = res.suggestions ?? [];
        this.suggestionsLoading = false;
      },
      error: () => {
        this.suggestionsError = true;
        this.suggestionsLoading = false;
      },
    });
  }
}
