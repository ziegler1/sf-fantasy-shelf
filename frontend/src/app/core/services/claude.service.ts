import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface BookRecommendation {
  title: string;
  author: string;
  reason: string;
  url?: string;
}

export interface AuthorSuggestion {
  name: string;
  known_for: string;
  reason: string;
  url?: string;
}

export interface SummaryResponse {
  summary: string;
  book_id: number;
}

export interface NextResponse {
  recommendations: BookRecommendation[];
  message?: string;
}

export interface SimilarAuthorsResponse {
  suggestions: AuthorSuggestion[];
  author_id: number;
}

@Injectable({ providedIn: 'root' })
export class ClaudeService {
  private readonly base = '/api/claude';

  constructor(private http: HttpClient) {}

  getBookSummary(bookId: number): Observable<SummaryResponse> {
    return this.http.post<SummaryResponse>(`${this.base}/summary`, { book_id: bookId });
  }

  getNextRecommendations(userId = 1): Observable<NextResponse> {
    return this.http.post<NextResponse>(`${this.base}/next`, { user_id: userId });
  }

  getSimilarAuthors(authorId: number, userId = 1): Observable<SimilarAuthorsResponse> {
    return this.http.post<SimilarAuthorsResponse>(`${this.base}/similar-authors`, {
      author_id: authorId,
      user_id: userId,
    });
  }
}
