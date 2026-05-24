import { Routes } from '@angular/router';
import { LayoutComponent } from './core/layout/layout.component';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login/login.component').then(m => m.LoginComponent),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./features/auth/register/register.component').then(m => m.RegisterComponent),
  },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
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
      {
        path: 'analytics',
        loadComponent: () =>
          import('./features/analytics/analytics.component').then(m => m.AnalyticsComponent),
      },
      {
        path: 'account',
        loadComponent: () =>
          import('./features/account/account.component').then(m => m.AccountComponent),
      },
    ],
  },
  { path: '**', redirectTo: 'library' },
];
