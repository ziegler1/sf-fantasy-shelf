import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

interface Book {
  id: number;
  title: string;
  author: string;
  genre: string;
  status: 'want-to-read' | 'reading' | 'read';
}

@Component({
  selector: 'app-shelf',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './shelf.component.html',
})
export class ShelfComponent implements OnInit {
  books: Book[] = [];

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.http.get<Book[]>('/api/books').subscribe(books => {
      this.books = books;
    });
  }
}
