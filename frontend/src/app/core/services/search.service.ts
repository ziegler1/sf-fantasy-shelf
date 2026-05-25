import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { BookWithDetails, ReadingStatus } from '../../types/schema.types';

export interface BookSearchResult {
  google_id: string;
  title: string;
  authors: string[];
  cover_url: string | null;
  published_at: string | null;
  page_count: number | null;
  isbn: string | null;
  isbn13: string | null;
  description: string | null;
  language: string;
  series_name: string | null;
  series_position: number | null;
  categories: string[];
}

export interface ImportBookBody extends Omit<BookSearchResult, 'google_id'> {
  google_id?: string;
  status?: ReadingStatus;
  tags?: string[];
  rating?: number | null;
}

@Injectable({ providedIn: 'root' })
export class SearchService {
  constructor(private http: HttpClient) {}

  searchBooks(q: string): Observable<BookSearchResult[]> {
    const params = new HttpParams().set('q', q);
    return this.http.get<BookSearchResult[]>('/api/search', { params });
  }

  importBook(body: ImportBookBody): Observable<BookWithDetails> {
    return this.http.post<BookWithDetails>('/api/books/import', body);
  }

  detectSeries(title: string, author: string): Observable<{ series_name: string | null; series_position: number | null }> {
    return this.http.post<{ series_name: string | null; series_position: number | null }>(
      '/api/claude/series-detect', { title, author },
    );
  }
}
