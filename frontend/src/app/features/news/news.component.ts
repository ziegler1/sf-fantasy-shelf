import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NewsService, NewsArticle } from '../../core/services/news.service';

const SOURCE_COLORS: Record<string, string> = {
  'Reactor':             '#f97316',
  'Locus Magazine':      '#a78bfa',
  'SFF World':           '#10b981',
  'The Wertzone':        '#06b6d4',
  'Fantasy Book Critic': '#ec4899',
  'Fantasy Faction':     '#f59e0b',
  'io9':                 '#3b82f6',
};

interface RefreshResult { source: string; added: number; error?: string }

@Component({
  selector: 'app-news',
  standalone: true,
  imports: [
    CommonModule, DatePipe,
    MatIconModule, MatButtonModule,
    MatProgressSpinnerModule, MatTooltipModule,
  ],
  template: `
    <div class="page-header">
      <h1 class="page-title">News Feed</h1>
      <button mat-icon-button matTooltip="Fetch latest articles from sources" (click)="refresh()" [disabled]="loading || refreshing">
        <mat-icon [class.spinning]="refreshing">refresh</mat-icon>
      </button>
    </div>

    @if (lastRefresh.length) {
      <div class="refresh-results">
        @for (r of lastRefresh; track r.source) {
          <div class="refresh-row" [class.ok]="!r.error" [class.err]="!!r.error">
            <strong>{{ r.source }}:</strong>
            {{ r.error ? r.error : '+' + r.added + ' articles' }}
          </div>
        }
      </div>
    }

    @if (sources.length > 1) {
      <div class="source-filters">
        <button class="filter-chip" [class.active]="activeSource === null"
                (click)="activeSource = null">All</button>
        @for (s of sources; track s) {
          <button class="filter-chip" [class.active]="activeSource === s"
                  [style.--chip-color]="sourceColor(s)"
                  (click)="activeSource = s">{{ s }}</button>
        }
      </div>
    }

    @if (loading) {
      <div class="loading-state"><mat-spinner diameter="36" /></div>
    } @else if (!filtered.length) {
      <div class="empty-state">
        <mat-icon>rss_feed</mat-icon>
        <p>No articles yet — check back soon.</p>
      </div>
    } @else {
      <div class="articles-grid">
        @for (a of filtered; track a.id) {
          <a class="article-card" [href]="a.url" target="_blank" rel="noopener noreferrer">
            <div class="article-image">
              @if (a.image_url && !imgErrors.has(a.id)) {
                <img [src]="a.image_url" [alt]="a.title"
                     (error)="imgErrors.add(a.id)" loading="lazy">
              } @else {
                <div class="img-placeholder">
                  <mat-icon>article</mat-icon>
                </div>
              }
            </div>
            <div class="article-body">
              <div class="article-meta">
                <span class="source-badge"
                      [style.background]="sourceColor(a.source_name)">
                  {{ a.source_name }}
                </span>
                <span class="article-date">
                  {{ (a.published_at ?? a.created_at) | date:'MMM d' }}
                </span>
              </div>
              <p class="article-title">{{ a.title }}</p>
              @if (a.description) {
                <p class="article-desc">{{ a.description }}</p>
              }
            </div>
            <mat-icon class="article-arrow">open_in_new</mat-icon>
            <button class="article-delete"
                    (click)="deleteArticle(a.id, $event)"
                    [disabled]="deleting.has(a.id)"
                    matTooltip="Dismiss article">
              @if (deleting.has(a.id)) {
                <mat-spinner diameter="12" />
              } @else {
                <mat-icon>close</mat-icon>
              }
            </button>
          </a>
        }
      </div>
    }
  `,
  styles: [`
    .page-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .page-header h1 { flex: 1; }

    @keyframes spin { to { transform: rotate(360deg); } }
    .spinning { animation: spin 0.8s linear infinite; }

    .refresh-results {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin-bottom: 1rem;
    }

    .refresh-pill {
      font-size: 0.7rem;
      padding: 0.2rem 0.6rem;
      border-radius: 999px;
      cursor: default;
    }

    .refresh-pill.ok  { background: rgba(16,185,129,0.15); color: #34d399; }
    .refresh-pill.err { background: rgba(248,113,113,0.15); color: #f87171; }

    .source-filters {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 1.25rem;
    }

    .filter-chip {
      padding: 0.25rem 0.75rem;
      border-radius: 999px;
      border: 1px solid var(--border-hover);
      background: transparent;
      color: var(--text-secondary);
      font-size: 0.75rem;
      cursor: pointer;
      transition: all 0.15s;
    }

    .filter-chip:hover { border-color: var(--border-hover); color: var(--text-bright); }

    .filter-chip.active {
      background: var(--chip-color, var(--accent));
      border-color: transparent;
      color: #fff;
    }

    .loading-state {
      display: flex;
      justify-content: center;
      padding: 4rem 0;
    }

    .articles-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 0.875rem;
    }

    .article-card {
      display: flex;
      flex-direction: column;
      background: var(--bg-surface);
      border-radius: 10px;
      border: 1px solid var(--border-subtle);
      overflow: hidden;
      text-decoration: none;
      color: inherit;
      transition: border-color 0.15s, transform 0.15s;
      position: relative;
    }

    .article-card:hover {
      border-color: var(--accent-border-hover);
      transform: translateY(-2px);
    }

    .article-image {
      width: 100%;
      height: 140px;
      overflow: hidden;
      background: var(--bg-base);
      flex-shrink: 0;
    }

    .article-image img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .img-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .img-placeholder mat-icon {
      font-size: 2rem;
      width: 2rem;
      height: 2rem;
      color: var(--bg-surface);
    }

    .article-body {
      flex: 1;
      padding: 0.875rem;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .article-meta {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .source-badge {
      font-size: 0.65rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      padding: 0.15rem 0.5rem;
      border-radius: 999px;
      color: #fff;
    }

    .article-date {
      font-size: 0.7rem;
      color: var(--text-faint);
      margin-left: auto;
    }

    .article-title {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--text-bright);
      margin: 0;
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .article-desc {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin: 0;
      line-height: 1.5;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .article-arrow {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      font-size: 0.9rem !important;
      width: 0.9rem !important;
      height: 0.9rem !important;
      color: var(--text-disabled);
      opacity: 0;
      transition: opacity 0.15s;
    }

    .article-card:hover .article-arrow { opacity: 1; }

    .article-delete {
      position: absolute;
      top: 0.4rem;
      right: 1.8rem;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      background: none;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      color: var(--text-disabled);
      opacity: 0;
      transition: opacity 0.15s, color 0.15s, background 0.15s;
      padding: 0;
    }

    .article-card:hover .article-delete { opacity: 1; }

    @media (hover: none) {
      .article-delete { opacity: 1; }
    }

    .article-delete:hover {
      color: var(--error);
      background: rgba(248, 113, 113, 0.12);
    }

    .article-delete mat-icon {
      font-size: 0.9rem;
      width: 0.9rem;
      height: 0.9rem;
    }
  `],
})
export class NewsComponent implements OnInit {
  articles: NewsArticle[] = [];
  loading = true;
  refreshing = false;
  lastRefresh: RefreshResult[] = [];
  activeSource: string | null = null;
  readonly imgErrors  = new Set<number>();
  readonly deleting   = new Set<number>();

  constructor(private newsService: NewsService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.newsService.getArticles().subscribe({
      next: (data) => { this.articles = data; this.loading = false; },
      error: ()     => { this.loading = false; },
    });
  }

  refresh(): void {
    this.refreshing = true;
    this.lastRefresh = [];
    this.newsService.refresh().subscribe({
      next: (res) => {
        this.lastRefresh = res.results;
        this.refreshing = false;
        this.load();
      },
      error: () => { this.refreshing = false; },
    });
  }

  get sources(): string[] {
    return [...new Set(this.articles.map(a => a.source_name))];
  }

  get filtered(): NewsArticle[] {
    const base = this.activeSource
      ? this.articles.filter(a => a.source_name === this.activeSource)
      : this.articles;
    return [...base].sort((a, b) => {
      const da = new Date(a.published_at ?? a.created_at).getTime();
      const db = new Date(b.published_at ?? b.created_at).getTime();
      return db - da;
    });
  }

  deleteArticle(id: number, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.deleting.has(id)) return;
    this.deleting.add(id);
    this.newsService.deleteArticle(id).subscribe({
      next: () => {
        this.articles = this.articles.filter(a => a.id !== id);
        this.deleting.delete(id);
      },
      error: () => this.deleting.delete(id),
    });
  }

  sourceColor(name: string): string {
    return SOURCE_COLORS[name] ?? '#64748b';
  }
}
