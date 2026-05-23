import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { Author, AuthorRole, Book, BookWithDetails, UserBook, ReadingStatus } from '../../types/schema.types';

type CreateBookBody = Partial<Book> & {
  author_ids?: { author_id: number; role?: string }[];
  tag_ids?: number[];
  series?: { series_id: number; position?: number }[];
};

type ShelfUpdate = Partial<Pick<UserBook, 'status' | 'rating' | 'review' | 'notes' | 'started_at' | 'finished_at'>>;

@Injectable({ providedIn: 'root' })
export class BookService {
  private readonly base = '/api/books';

  constructor(private http: HttpClient) {}

  getBooks(filters?: { status?: ReadingStatus; search?: string }): Observable<BookWithDetails[]> {
    let params = new HttpParams();
    if (filters?.status) params = params.set('status', filters.status);
    if (filters?.search) params = params.set('search', filters.search);
    return this.http.get<BookWithDetails[]>(this.base, { params });
  }

  getBook(id: number): Observable<BookWithDetails> {
    return this.http.get<BookWithDetails>(`${this.base}/${id}`);
  }

  createBook(body: CreateBookBody): Observable<Book> {
    return this.http.post<Book>(this.base, body);
  }

  updateBook(id: number, body: Partial<Book>): Observable<Book> {
    return this.http.put<Book>(`${this.base}/${id}`, body);
  }

  deleteBook(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  updateShelf(id: number, update: ShelfUpdate): Observable<UserBook> {
    return this.http.put<UserBook>(`${this.base}/${id}/shelf`, update);
  }

  removeFromShelf(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}/shelf`);
  }

  updateBookAuthors(id: number, authors: string[]): Observable<(Author & { role: AuthorRole })[]> {
    return this.http.put<(Author & { role: AuthorRole })[]>(`${this.base}/${id}/authors`, { authors });
  }
}
