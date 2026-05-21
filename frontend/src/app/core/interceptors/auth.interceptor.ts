import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  // Attach token to all /api/* requests
  const token = auth.getToken();
  if (token && req.url.startsWith('/api/')) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      // 401 on any protected route = token expired or invalid → log out
      if (err.status === 401 && req.url.startsWith('/api/') && !req.url.includes('/api/auth/')) {
        auth.logout();
      }
      return throwError(() => err);
    }),
  );
};
