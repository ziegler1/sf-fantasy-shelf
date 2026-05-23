import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface NewsArticle {
  id: number;
  source_name: string;
  title: string;
  url: string;
  description: string | null;
  image_url: string | null;
  published_at: string | null;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class NewsService {
  constructor(private http: HttpClient) {}

  getArticles(limit = 60, offset = 0): Observable<NewsArticle[]> {
    const params = new HttpParams().set('limit', limit).set('offset', offset);
    return this.http.get<NewsArticle[]>('/api/news', { params });
  }

  refresh(): Observable<{ results: { source: string; added: number; error?: string }[]; total: number }> {
    return this.http.post<{ results: { source: string; added: number; error?: string }[]; total: number }>(
      '/api/news/refresh', {},
    );
  }
}
