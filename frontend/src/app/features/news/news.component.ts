import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-news',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <div class="page-header">
      <h1 class="page-title">News Feed</h1>
    </div>
    <div class="empty-state">
      <mat-icon>rss_feed</mat-icon>
      <p>Sci-fi and fantasy news from around the web.</p>
      <span style="font-size:0.8rem;color:#475569">Coming soon</span>
    </div>
  `,
})
export class NewsComponent {}
