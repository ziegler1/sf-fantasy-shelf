import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { Series, SeriesWithBooks } from '../../types/schema.types';

@Injectable({ providedIn: 'root' })
export class SeriesService {
  private readonly base = '/api/series';

  constructor(private http: HttpClient) {}

  getSeries(): Observable<SeriesWithBooks[]> {
    return this.http.get<SeriesWithBooks[]>(this.base);
  }

  getSeriesById(id: number): Observable<SeriesWithBooks> {
    return this.http.get<SeriesWithBooks>(`${this.base}/${id}`);
  }

  createSeries(body: Partial<Series>): Observable<Series> {
    return this.http.post<Series>(this.base, body);
  }

  updateSeries(id: number, body: Partial<Series>): Observable<Series> {
    return this.http.put<Series>(`${this.base}/${id}`, body);
  }

  deleteSeries(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  removeBookFromSeries(seriesId: number, bookId: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${seriesId}/books/${bookId}`);
  }
}
