import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-discover',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <div class="page-header">
      <h1 class="page-title">Discover</h1>
    </div>
    <div class="empty-state">
      <mat-icon>explore</mat-icon>
      <p>Browse and search for new books.</p>
      <span style="font-size:0.8rem;color:#475569">Coming soon</span>
    </div>
  `,
})
export class DiscoverComponent {}
