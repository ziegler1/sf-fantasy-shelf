import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NewsService, NewsArticle } from '../../core/services/news.service';

const SOURCE_COLORS: Record<string, string> = {
  'Tor.com':        '#f97316',
  'Locus Magazine': '#a78bfa',
  'SFF World':      '#10b981',
  'Reddit Fantasy': '#f43f5e',
  'Reddit SF':      '#fb923c',
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
          <span class="refresh-pill" [class.ok]="!r.error" [class.err]="!!r.error"
                [matTooltip]="r.error ?? (r.added + ' new')">
            {{ r.source }}: {{ r.error ? 'error' : '+' + r.added }}
          </span>
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
      border: 1px solid rgba(255,255,255,0.12);
      background: transparent;
      color: #94a3b8;
      font-size: 0.75rem;
      cursor: pointer;
      transition: all 0.15s;
    }

    .filter-chip:hover { border-color: rgba(255,255,255,0.25); color: #f1f5f9; }

    .filter-chip.active {
      background: var(--chip-color, #a78bfa);
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
      background: #1e293b;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.05);
      overflow: hidden;
      text-decoration: none;
      color: inherit;
      transition: border-color 0.15s, transform 0.15s;
      position: relative;
    }

    .article-card:hover {
      border-color: rgba(167,139,250,0.35);
      transform: translateY(-2px);
    }

    .article-image {
      width: 100%;
      height: 140px;
      overflow: hidden;
      background: #0f172a;
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
      color: #1e293b;
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
      color: #475569;
      margin-left: auto;
    }

    .article-title {
      font-size: 0.875rem;
      font-weight: 600;
      color: #f1f5f9;
      margin: 0;
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .article-desc {
      font-size: 0.75rem;
      color: #64748b;
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
      color: #334155;
      opacity: 0;
      transition: opacity 0.15s;
    }

    .article-card:hover .article-arrow { opacity: 1; }
  `],
})
export class NewsComponent implements OnInit {
  articles: NewsArticle[] = [];
  loading = true;
  refreshing = false;
  lastRefresh: RefreshResult[] = [];
  activeSource: string | null = null;
  readonly imgErrors = new Set<number>();

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
    return this.activeSource
      ? this.articles.filter(a => a.source_name === this.activeSource)
      : this.articles;
  }

  sourceColor(name: string): string {
    return SOURCE_COLORS[name] ?? '#64748b';
  }
}
