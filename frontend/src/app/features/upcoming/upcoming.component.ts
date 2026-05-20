import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-upcoming',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <div class="page-header">
      <h1 class="page-title">Upcoming Releases</h1>
    </div>
    <div class="empty-state">
      <mat-icon>event_available</mat-icon>
      <p>Track books you're waiting for.</p>
      <span style="font-size:0.8rem;color:#475569">Coming soon</span>
    </div>
  `,
})
export class UpcomingComponent {}
