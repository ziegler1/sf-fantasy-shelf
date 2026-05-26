import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NewsService, NewsArticle, FeedSource } from '../../core/services/news.service';

const SOURCE_COLORS: Record<string, string> = {
  // SF/Fantasy
  'Reactor':             '#f97316',
  'Locus Magazine':      '#8b5cf6',
  'SFF World':           '#10b981',
  'The Wertzone':        '#06b6d4',
  'Fantasy Book Critic': '#ec4899',
  'Fantasy Faction':     '#f59e0b',
  'io9':                 '#3b82f6',
  // Book News
  'Book Riot':           '#e11d48',
  'Literary Hub':        '#7c3aed',
  'The Guardian Books':  '#0891b2',
  'NPR Books':           '#1d4ed8',
  "Publisher's Weekly":  '#d97706',
  // Bestsellers
  'NYT Books':           '#374151',
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
      <button mat-icon-button matTooltip="Manage feed sources" (click)="toggleSources()" [class.active-btn]="showSources">
        <mat-icon>tune</mat-icon>
      </button>
      <button mat-icon-button matTooltip="Fetch latest articles from sources" (click)="refresh()" [disabled]="loading || refreshing">
        <mat-icon [class.spinning]="refreshing">refresh</mat-icon>
      </button>
    </div>

    @if (showSources) {
      <div class="sources-panel">
        <p class="sources-heading">Feed Sources</p>
        @if (sourcesLoading) {
          <div class="sources-loading"><mat-spinner diameter="24" /></div>
        } @else {
          @for (cat of categories; track cat) {
            <p class="cat-label">{{ cat }}</p>
            <div class="sources-row">
              @for (s of sourcesByCategory(cat); track s.name) {
                <button class="source-chip"
                        [class.chip-enabled]="s.enabled"
                        [style.--chip-bg]="sourceColor(s.name)"
                        (click)="toggleSourceEnabled(s)">
                  <span class="chip-dot"></span>
                  {{ s.name }}
                </button>
              }
            </div>
          }
        }
      </div>
    }

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
        @for (s of articleSources; track s) {
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
      @if (totalPages > 1) {
        <div class="pagination-row">
          <button mat-icon-button [disabled]="page === 0" (click)="prevPage()" matTooltip="Previous page">
            <mat-icon>chevron_left</mat-icon>
          </button>
          <span class="page-info">{{ page + 1 }} / {{ totalPages }}</span>
          <button mat-icon-button [disabled]="page >= totalPages - 1" (click)="nextPage()" matTooltip="Next page">
            <mat-icon>chevron_right</mat-icon>
          </button>
        </div>
      }
      <div class="articles-grid">
        @for (a of filtered; track a.id) {
          <div class="article-wrap">
            <div class="swipe-hint">
              <mat-icon>delete_sweep</mat-icon>
            </div>
            <a class="article-card"
               [class.is-swiping]="swipingIds.has(a.id)"
               [class.flying-out]="flyingOut.has(a.id)"
               [style.transform]="swipeX.has(a.id) ? 'translateX(' + swipeX.get(a.id) + 'px)' : null"
               [href]="a.url" target="_blank" rel="noopener noreferrer"
               (pointerdown)="onSwipeStart(a.id, $event)"
               (pointermove)="onSwipeMove(a.id, $event)"
               (pointerup)="onSwipeEnd(a.id, $event)"
               (pointercancel)="onSwipeCancel(a.id, $event)"
               (click)="onCardClick(a.id, $event)">
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
          </div>
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

    .active-btn { color: var(--accent) !important; }

    @keyframes spin { to { transform: rotate(360deg); } }
    .spinning { animation: spin 0.8s linear infinite; }

    /* ── Sources panel ── */
    .sources-panel {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      padding: 1rem 1.25rem 1.1rem;
      margin-bottom: 1.25rem;
    }

    .sources-heading {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin: 0 0 0.75rem;
    }

    .sources-loading {
      display: flex;
      justify-content: center;
      padding: 0.5rem 0;
    }

    .cat-label {
      font-size: 0.68rem;
      font-weight: 600;
      color: var(--text-faint);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 0.6rem 0 0.35rem;
    }

    .cat-label:first-of-type { margin-top: 0; }

    .sources-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin-bottom: 0.25rem;
    }

    .source-chip {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.25rem 0.65rem;
      border-radius: 999px;
      border: 1px solid var(--border-hover);
      background: transparent;
      color: var(--text-faint);
      font-size: 0.72rem;
      cursor: pointer;
      transition: all 0.15s;
    }

    .source-chip.chip-enabled {
      background: color-mix(in srgb, var(--chip-bg) 18%, transparent);
      border-color: color-mix(in srgb, var(--chip-bg) 50%, transparent);
      color: var(--text-bright);
    }

    .chip-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--chip-bg);
      opacity: 0.4;
      flex-shrink: 0;
      transition: opacity 0.15s;
    }

    .chip-enabled .chip-dot { opacity: 1; }

    /* ── Refresh results ── */
    .refresh-results {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin-bottom: 1rem;
    }

    .refresh-row {
      font-size: 0.72rem;
      padding: 0.2rem 0.6rem;
      border-radius: 999px;
    }

    .refresh-row.ok  { background: rgba(16,185,129,0.12); color: #34d399; }
    .refresh-row.err { background: rgba(248,113,113,0.12); color: #f87171; }

    /* ── Source filter chips ── */
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

    /* ── Loading / empty ── */
    .loading-state {
      display: flex;
      justify-content: center;
      padding: 4rem 0;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      padding: 4rem 0;
      color: var(--text-faint);
    }

    .empty-state mat-icon { font-size: 2.5rem; width: 2.5rem; height: 2.5rem; }

    /* ── Pagination ── */
    .pagination-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    .page-info {
      font-size: 0.8rem;
      color: var(--text-secondary);
      min-width: 3rem;
      text-align: center;
    }

    /* ── Articles grid ── */
    .articles-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 0.875rem;
    }

    .article-wrap {
      position: relative;
      border-radius: 10px;
      overflow: hidden;
    }

    .swipe-hint {
      position: absolute;
      inset: 0;
      background: var(--error, #ef4444);
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding-right: 1.25rem;
      border-radius: 10px;
    }

    .swipe-hint mat-icon {
      color: #fff;
      font-size: 1.75rem;
      width: 1.75rem;
      height: 1.75rem;
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
      transition: border-color 0.15s, transform 0.25s ease;
      position: relative;
      z-index: 1;
      touch-action: pan-y;
      user-select: none;
    }

    .article-card.is-swiping { transition: none; }

    .article-card.flying-out {
      transform: translateX(-110%) !important;
      opacity: 0;
      transition: transform 0.3s ease, opacity 0.2s ease !important;
    }

    .article-card:not(.is-swiping):hover {
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
  articles: NewsArticle[]  = [];
  sources: FeedSource[]    = [];
  loading        = true;
  sourcesLoading = false;
  refreshing     = false;
  showSources    = false;
  lastRefresh: RefreshResult[] = [];
  activeSource: string | null  = null;
  readonly PAGE_SIZE = 30;
  page  = 0;
  total = 0;
  readonly imgErrors = new Set<number>();
  readonly deleting  = new Set<number>();

  readonly swipeX      = new Map<number, number>();
  readonly swipingIds  = new Set<number>();
  readonly flyingOut   = new Set<number>();
  private readonly swipeMoved    = new Set<number>();
  private readonly pointerStates = new Map<number, {
    articleId: number; startX: number; startY: number; locked: boolean;
  }>();

  private static readonly SWIPE_THRESHOLD = 80;

  constructor(private newsService: NewsService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.newsService.getArticles(this.PAGE_SIZE, this.page * this.PAGE_SIZE).subscribe({
      next: ({ articles, total }) => { this.articles = articles; this.total = total; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  get totalPages(): number { return Math.ceil(this.total / this.PAGE_SIZE); }

  prevPage(): void {
    if (this.page > 0) { this.page--; this.load(); }
  }

  nextPage(): void {
    if (this.page < this.totalPages - 1) { this.page++; this.load(); }
  }

  toggleSources(): void {
    this.showSources = !this.showSources;
    if (this.showSources && this.sources.length === 0) {
      this.sourcesLoading = true;
      this.newsService.getSources().subscribe({
        next: s => { this.sources = s; this.sourcesLoading = false; },
        error: () => { this.sourcesLoading = false; },
      });
    }
  }

  get categories(): string[] {
    return [...new Set(this.sources.map(s => s.category))];
  }

  sourcesByCategory(cat: string): FeedSource[] {
    return this.sources.filter(s => s.category === cat);
  }

  toggleSourceEnabled(source: FeedSource): void {
    const next = !source.enabled;
    source.enabled = next;
    this.newsService.toggleSource(source.name, next).subscribe({
      error: () => { source.enabled = !next; },
    });
    this.page = 0;
    this.load();
  }

  refresh(): void {
    this.refreshing = true;
    this.lastRefresh = [];
    this.newsService.refresh().subscribe({
      next: (res) => {
        this.lastRefresh = res.results;
        this.refreshing  = false;
        this.page = 0;
        this.load();
      },
      error: () => { this.refreshing = false; },
    });
  }

  get articleSources(): string[] {
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

  onSwipeStart(articleId: number, event: PointerEvent): void {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.pointerStates.set(event.pointerId, {
      articleId, startX: event.clientX, startY: event.clientY, locked: false,
    });
  }

  onSwipeMove(articleId: number, event: PointerEvent): void {
    const state = this.pointerStates.get(event.pointerId);
    if (!state) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (!state.locked) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        this.pointerStates.delete(event.pointerId);
        return;
      }
      state.locked = true;
      this.swipingIds.add(articleId);
    }
    event.preventDefault();
    this.swipeX.set(articleId, Math.min(0, dx));
  }

  onSwipeEnd(articleId: number, event: PointerEvent): void {
    const state = this.pointerStates.get(event.pointerId);
    this.pointerStates.delete(event.pointerId);
    this.swipingIds.delete(articleId);
    if (!state?.locked) return;

    const dx = event.clientX - state.startX;
    this.swipeMoved.add(articleId);

    if (dx < -NewsComponent.SWIPE_THRESHOLD) {
      this.flyingOut.add(articleId);
      this.swipeX.delete(articleId);
      setTimeout(() => this.dismissArticle(articleId), 300);
    } else {
      this.swipeX.set(articleId, 0);
      setTimeout(() => {
        this.swipeX.delete(articleId);
        this.swipeMoved.delete(articleId);
      }, 250);
    }
  }

  onSwipeCancel(articleId: number, event: PointerEvent): void {
    this.pointerStates.delete(event.pointerId);
    this.swipingIds.delete(articleId);
    this.swipeX.set(articleId, 0);
    setTimeout(() => this.swipeX.delete(articleId), 250);
  }

  onCardClick(articleId: number, event: MouseEvent): void {
    if (this.swipeMoved.has(articleId)) {
      event.preventDefault();
    }
  }

  deleteArticle(id: number, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.dismissArticle(id);
  }

  private dismissArticle(id: number): void {
    if (this.deleting.has(id)) return;
    this.deleting.add(id);
    this.newsService.deleteArticle(id).subscribe({
      next: () => {
        this.articles = this.articles.filter(a => a.id !== id);
        this.deleting.delete(id);
        this.flyingOut.delete(id);
      },
      error: () => {
        this.deleting.delete(id);
        this.flyingOut.delete(id);
      },
    });
  }

  sourceColor(name: string): string {
    return SOURCE_COLORS[name] ?? '#64748b';
  }
}
