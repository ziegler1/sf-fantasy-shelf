import { Routes } from '@angular/router';
import { LayoutComponent } from './core/layout/layout.component';

export const routes: Routes = [
  {
    path: '',
    component: LayoutComponent,
    children: [
      { path: '', redirectTo: 'library', pathMatch: 'full' },
      {
        path: 'library',
        loadComponent: () =>
          import('./features/library/library.component').then(m => m.LibraryComponent),
      },
      {
        path: 'series',
        loadComponent: () =>
          import('./features/series-tracker/series-tracker.component').then(m => m.SeriesTrackerComponent),
      },
      {
        path: 'discover',
        loadComponent: () =>
          import('./features/discover/discover.component').then(m => m.DiscoverComponent),
      },
      {
        path: 'upcoming',
        loadComponent: () =>
          import('./features/upcoming/upcoming.component').then(m => m.UpcomingComponent),
      },
      {
        path: 'news',
        loadComponent: () =>
          import('./features/news/news.component').then(m => m.NewsComponent),
      },
    ],
  },
];
