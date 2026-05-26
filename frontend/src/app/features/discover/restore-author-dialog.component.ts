import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { BookService } from '../../core/services/book.service';
import { AuthorService } from '../../core/services/author.service';
import type { BookWithDetails } from '../../types/schema.types';

@Component({
  selector: 'app-restore-author-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatCheckboxModule,
    MatProgressSpinnerModule, MatIconModule,
  ],
  template: `
    <h2 mat-dialog-title>Restore Deleted Author</h2>
    <mat-dialog-content class="content">
      @if (loading) {
        <div class="spinner-row"><mat-spinner diameter="28" /></div>
      } @else if (orphanedBooks.length === 0) {
        <div class="no-orphans">
          <mat-icon>check_circle</mat-icon>
          <p>No books with missing authors found in your library.</p>
        </div>
      } @else {
        <mat-form-field appearance="outline" class="name-field">
          <mat-label>Author name to restore</mat-label>
          <input matInput [(ngModel)]="authorName" placeholder="e.g. Brandon Sanderson">
        </mat-form-field>

        <p class="list-label">
          Books with no author — {{ selectedIds.size }} of {{ orphanedBooks.length }} selected:
        </p>
        <div class="book-list">
          <div class="select-all-row">
            <mat-checkbox
              [checked]="allSelected"
              [indeterminate]="someSelected && !allSelected"
              (change)="toggleAll($event.checked)">
              Select all
            </mat-checkbox>
          </div>
          @for (book of orphanedBooks; track book.id) {
            <div class="book-row">
              <mat-checkbox
                [checked]="selectedIds.has(book.id)"
                (change)="toggle(book.id, $event.checked)">
                <span class="book-title">{{ book.title }}</span>
              </mat-checkbox>
            </div>
          }
        </div>
      }

      @if (error) {
        <p class="error-msg">{{ error }}</p>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      @if (orphanedBooks.length > 0) {
        <button mat-flat-button color="primary"
          [disabled]="!authorName.trim() || selectedIds.size === 0 || saving"
          (click)="restore()">
          @if (saving) {
            <mat-spinner diameter="16" style="display:inline-block" />
          } @else {
            Restore {{ selectedIds.size }} book{{ selectedIds.size === 1 ? '' : 's' }}
          }
        </button>
      }
    </mat-dialog-actions>
  `,
  styles: [`
    .content { min-width: min(380px, 90vw); max-width: 520px; }
    .spinner-row { display: flex; justify-content: center; padding: 2rem; }
    .name-field { width: 100%; margin-bottom: 0.75rem; }
    .list-label { font-size: 0.8rem; color: var(--text-muted); margin: 0 0 0.5rem; }
    .book-list {
      max-height: 320px; overflow-y: auto;
      border: 1px solid var(--border); border-radius: 6px; padding: 0.5rem 0.75rem;
    }
    .select-all-row {
      padding: 0.2rem 0 0.5rem;
      border-bottom: 1px solid var(--border-subtle);
      margin-bottom: 0.35rem;
    }
    .book-row { padding: 0.25rem 0; }
    .book-title { font-size: 0.85rem; }
    .no-orphans { display: flex; align-items: center; gap: 0.5rem; color: var(--accent); padding: 1rem 0; }
    .no-orphans mat-icon { color: inherit; }
    .error-msg { color: var(--error); font-size: 0.8rem; margin: 0.5rem 0 0; }
  `],
})
export class RestoreAuthorDialogComponent implements OnInit {
  loading = true;
  saving  = false;
  orphanedBooks: BookWithDetails[] = [];
  selectedIds   = new Set<number>();
  authorName    = '';
  error         = '';

  constructor(
    private bookService:   BookService,
    private authorService: AuthorService,
    private dialogRef:     MatDialogRef<RestoreAuthorDialogComponent>,
  ) {}

  ngOnInit(): void {
    this.bookService.getAllBooks().subscribe({
      next: books => {
        this.orphanedBooks = books.filter(b => b.authors.length === 0);
        this.orphanedBooks.forEach(b => this.selectedIds.add(b.id));
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  get allSelected(): boolean { return this.selectedIds.size === this.orphanedBooks.length && this.orphanedBooks.length > 0; }
  get someSelected(): boolean { return this.selectedIds.size > 0; }

  toggleAll(checked: boolean): void {
    if (checked) this.orphanedBooks.forEach(b => this.selectedIds.add(b.id));
    else this.selectedIds.clear();
  }

  toggle(id: number, checked: boolean): void {
    if (checked) this.selectedIds.add(id);
    else this.selectedIds.delete(id);
  }

  restore(): void {
    if (!this.authorName.trim() || this.selectedIds.size === 0) return;
    this.saving = true;
    this.error  = '';
    this.authorService.restoreAuthor(this.authorName.trim(), [...this.selectedIds]).subscribe({
      next: () => this.dialogRef.close(true),
      error: () => {
        this.error  = 'Something went wrong. Please try again.';
        this.saving = false;
      },
    });
  }
}
