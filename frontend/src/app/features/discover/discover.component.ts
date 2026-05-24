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
import { ClaudeService, BookRecommendation, AuthorSuggestion } from '../../core/services/claude.service';
import { AuthorService } from '../../core/services/author.service';
import type { Author } from '../../types/schema.types';

const RECS_STORAGE_KEY = 'sfs_recommendations';

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

  constructor(
    private claude: ClaudeService,
    private authorService: AuthorService,
  ) {}

  ngOnInit(): void {
    // Restore cached recommendations — don't hit the API on every page visit
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

  dismissSuggestion(name: string): void {
    this.suggestions = this.suggestions.filter(s => s.name !== name);
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
