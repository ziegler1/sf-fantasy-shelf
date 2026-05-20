import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { ClaudeService, BookRecommendation, AuthorSuggestion } from '../../core/services/claude.service';
import { AuthorService } from '../../core/services/author.service';
import type { Author } from '../../types/schema.types';

@Component({
  selector: 'app-discover',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatCardModule, MatButtonModule, MatIconModule,
    MatProgressSpinnerModule, MatSelectModule, MatFormFieldModule,
  ],
  templateUrl: './discover.component.html',
})
export class DiscoverComponent implements OnInit {
  // Next-up recommendations
  recommendations: BookRecommendation[] = [];
  recsLoading = false;
  recsError = false;
  recsMessage = '';

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
    this.loadRecommendations();
    this.authorService.getAuthors().subscribe({
      next: authors => { this.authors = authors; },
    });
  }

  loadRecommendations(): void {
    this.recsLoading = true;
    this.recsError = false;
    this.recommendations = [];

    this.claude.getNextRecommendations().subscribe({
      next: res => {
        this.recommendations = res.recommendations ?? [];
        this.recsMessage = res.message ?? '';
        this.recsLoading = false;
      },
      error: () => {
        this.recsError = true;
        this.recsLoading = false;
      },
    });
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
