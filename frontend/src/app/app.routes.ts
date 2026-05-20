import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'shelf', pathMatch: 'full' },
  {
    path: 'shelf',
    loadComponent: () =>
      import('./shelf/shelf.component').then(m => m.ShelfComponent)
  }
];
