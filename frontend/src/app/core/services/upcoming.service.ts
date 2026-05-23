import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { UpcomingRelease } from '../../types/schema.types';

export interface AddUpcomingBody {
  title: string;
  author_name?: string | null;
  release_date?: string | null;
  isbn?: string | null;
  cover_url?: string | null;
  notes?: string | null;
}

@Injectable({ providedIn: 'root' })
export class UpcomingService {
  private readonly base = '/api/upcoming';

  constructor(private http: HttpClient) {}

  getAll(): Observable<UpcomingRelease[]> {
    return this.http.get<UpcomingRelease[]>(this.base);
  }

  add(body: AddUpcomingBody): Observable<UpcomingRelease> {
    return this.http.post<UpcomingRelease>(this.base, body);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
