import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { Author, AuthorWithBooks } from '../../types/schema.types';

@Injectable({ providedIn: 'root' })
export class AuthorService {
  private readonly base = '/api/authors';

  constructor(private http: HttpClient) {}

  getAuthors(): Observable<AuthorWithBooks[]> {
    return this.http.get<AuthorWithBooks[]>(this.base);
  }

  getAuthor(id: number): Observable<AuthorWithBooks> {
    return this.http.get<AuthorWithBooks>(`${this.base}/${id}`);
  }

  createAuthor(body: Partial<Author>): Observable<Author> {
    return this.http.post<Author>(this.base, body);
  }

  updateAuthor(id: number, body: Partial<Author>): Observable<Author> {
    return this.http.put<Author>(`${this.base}/${id}`, body);
  }

  deleteAuthor(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  follow(id: number): Observable<void> {
    return this.http.post<void>(`${this.base}/${id}/follow`, {});
  }

  unfollow(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}/follow`);
  }
}
