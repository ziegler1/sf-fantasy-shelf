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

export interface FeedSource {
  name: string;
  category: string;
  enabled: boolean;
}

@Injectable({ providedIn: 'root' })
export class NewsService {
  constructor(private http: HttpClient) {}

  getArticles(limit = 30, offset = 0): Observable<{ articles: NewsArticle[]; total: number }> {
    const params = new HttpParams().set('limit', limit).set('offset', offset);
    return this.http.get<{ articles: NewsArticle[]; total: number }>('/api/news', { params });
  }

  getSources(): Observable<FeedSource[]> {
    return this.http.get<FeedSource[]>('/api/news/sources');
  }

  toggleSource(name: string, enabled: boolean): Observable<{ name: string; enabled: boolean }> {
    return this.http.put<{ name: string; enabled: boolean }>(
      `/api/news/sources/${encodeURIComponent(name)}`,
      { enabled },
    );
  }

  refresh(): Observable<{ results: { source: string; added: number; error?: string }[]; total: number }> {
    return this.http.post<{ results: { source: string; added: number; error?: string }[]; total: number }>(
      '/api/news/refresh', {},
    );
  }

  deleteArticle(id: number): Observable<void> {
    return this.http.delete<void>(`/api/news/${id}`);
  }
}
