import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { UpcomingService } from '../../core/services/upcoming.service';
import { AddUpcomingDialogComponent } from './add-upcoming-dialog.component';
import type { UpcomingRelease } from '../../types/schema.types';

interface ReleaseGroup {
  key: string;
  label: string;
  past: boolean;
  items: UpcomingRelease[];
}

@Component({
  selector: 'app-upcoming',
  standalone: true,
  imports: [
    CommonModule, DatePipe, MatIconModule, MatButtonModule,
    MatTooltipModule, MatProgressSpinnerModule, MatDialogModule,
  ],
  template: `
    <div class="page-header">
      <h1 class="page-title">Upcoming Releases</h1>
      <button mat-flat-button color="primary" (click)="openAdd()">
        <mat-icon>add</mat-icon> Add Release
      </button>
    </div>

    @if (loading) {
      <div class="loading-state">
        <mat-spinner diameter="36" />
      </div>
    } @else if (!releases.length) {
      <div class="empty-state">
        <mat-icon>event_available</mat-icon>
        <p>No upcoming releases tracked yet.</p>
        <button mat-stroked-button (click)="openAdd()">Add your first release</button>
      </div>
    } @else {
      @for (group of groups; track group.key) {
        <div class="month-section">
          <h2 class="month-heading" [class.past]="group.past">{{ group.label }}</h2>
          <div class="release-list">
            @for (r of group.items; track r.id) {
              <div class="release-card">
                <div class="release-cover">
                  @if (r.cover_url) {
                    <img [src]="r.cover_url" [alt]="r.title" class="cover-img">
                  } @else {
                    <div class="cover-placeholder"><mat-icon>menu_book</mat-icon></div>
                  }
                </div>
                <div class="release-info">
                  <p class="release-title">{{ r.title }}</p>
                  @if (r.author_name) {
                    <p class="release-author">{{ r.author_name }}</p>
                  }
                  @if (r.release_date) {
                    <p class="release-date">
                      <mat-icon>event</mat-icon>
                      {{ r.release_date | date:'MMMM d, yyyy' : 'UTC' }}
                    </p>
                  }
                  @if (r.description) {
                    <p class="release-notes">{{ r.description }}</p>
                  }
                  @if (r.notes) {
                    <p class="release-notes release-notes-user">{{ r.notes }}</p>
                  }
                </div>
                <button mat-icon-button class="delete-btn" matTooltip="Remove"
                        (click)="deleteRelease(r.id)">
                  <mat-icon>delete_outline</mat-icon>
                </button>
              </div>
            }
          </div>
        </div>
      }
    }
  `,
  styles: [`
    .loading-state {
      display: flex;
      justify-content: center;
      padding: 4rem 0;
    }

    .month-section { margin-bottom: 2rem; }

    .month-heading {
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      color: #64748b;
      margin: 0 0 0.75rem;
      padding-bottom: 0.4rem;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }

    .month-heading.past { color: #f87171; }

    .release-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .release-card {
      display: flex;
      align-items: center;
      gap: 0.875rem;
      padding: 0.75rem;
      background: #1e293b;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.05);
    }

    .release-cover {
      flex-shrink: 0;
      width: 48px;
      height: 72px;
      border-radius: 4px;
      overflow: hidden;
      background: #0f172a;
    }

    .cover-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .cover-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .cover-placeholder mat-icon {
      font-size: 1.25rem;
      width: 1.25rem;
      height: 1.25rem;
      color: #334155;
    }

    .release-info {
      flex: 1;
      min-width: 0;
    }

    .release-title {
      font-size: 0.9rem;
      font-weight: 600;
      color: #f1f5f9;
      margin: 0 0 0.2rem;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .release-author {
      font-size: 0.78rem;
      color: #94a3b8;
      margin: 0 0 0.3rem;
    }

    .release-date {
      display: flex;
      align-items: center;
      gap: 0.2rem;
      font-size: 0.72rem;
      color: #64748b;
      margin: 0 0 0.25rem;
    }

    .release-date mat-icon {
      font-size: 0.85rem;
      width: 0.85rem;
      height: 0.85rem;
      color: #a78bfa;
    }

    .release-notes {
      font-size: 0.75rem;
      color: #64748b;
      margin: 0;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
    }

    .release-notes-user {
      color: #94a3b8;
      margin-top: 0.2rem;
      font-style: italic;
    }

    .delete-btn {
      flex-shrink: 0;
      color: #334155 !important;
    }

    .delete-btn:hover { color: #f87171 !important; }
  `],
})
export class UpcomingComponent implements OnInit {
  releases: UpcomingRelease[] = [];
  loading = true;

  constructor(
    private upcomingService: UpcomingService,
    private dialog: MatDialog,
  ) {}

  ngOnInit(): void {
    this.upcomingService.getAll().subscribe({
      next: (data) => {
        this.releases = data;
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  get groups(): ReleaseGroup[] {
    const sorted = [...this.releases].sort((a, b) => {
      if (!a.release_date) return 1;
      if (!b.release_date) return -1;
      return a.release_date.localeCompare(b.release_date);
    });

    const now = new Date();
    const thisYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const map = new Map<string, ReleaseGroup>();

    for (const r of sorted) {
      let key: string;
      let label: string;
      let past = false;

      if (!r.release_date) {
        key = 'zzz';
        label = 'Date Unknown';
      } else {
        const ym = r.release_date.slice(0, 7);
        if (ym < thisYM) {
          key = '000-overdue';
          label = 'Overdue';
          past = true;
        } else {
          key = ym;
          const [y, m] = ym.split('-').map(Number);
          label = new Date(y, m - 1, 1)
            .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
            .toUpperCase();
        }
      }

      if (!map.has(key)) map.set(key, { key, label, past, items: [] });
      map.get(key)!.items.push(r);
    }

    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  }

  openAdd(): void {
    const ref = this.dialog.open(AddUpcomingDialogComponent, {
      panelClass: 'book-detail-panel',
    });
    ref.afterClosed().subscribe((release: UpcomingRelease | undefined) => {
      if (release) this.releases = [...this.releases, release];
    });
  }

  deleteRelease(id: number): void {
    this.upcomingService.delete(id).subscribe({
      next: () => {
        this.releases = this.releases.filter(r => r.id !== id);
      },
    });
  }
}
