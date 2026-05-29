import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { LoggingService } from '../services/logging.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const logging = inject(LoggingService);

  // Attach token to all /api/* requests
  const token = auth.getToken();
  if (token && req.url.startsWith('/api/')) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      // Skip logging errors to /api/logs to avoid infinite loops
      if (!req.url.includes('/api/logs')) {
        logging.error(`HTTP ${err.status} ${req.method} ${req.url}`, '', {
          method: req.method,
          url: req.url,
          status: err.status,
          message: err.message,
        });
      }

      // 401 on any protected route = token expired or invalid → log out
      if (err.status === 401 && req.url.startsWith('/api/') && !req.url.includes('/api/auth/')) {
        auth.logout();
      }
      return throwError(() => err);
    }),
  );
};
