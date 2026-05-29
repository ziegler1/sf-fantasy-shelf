import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface ErrorLog {
  message: string;
  level: 'error' | 'warn' | 'info';
  url?: string;
  stack?: string;
  context?: Record<string, any>;
}

@Injectable({
  providedIn: 'root',
})
export class LoggingService {
  constructor(private http: HttpClient) {}

  log(entry: ErrorLog): void {
    this.http.post('/api/logs/errors', entry).subscribe({
      error: (err) => {
        // Fail silently to avoid infinite loop if logging itself fails
        console.error('[LoggingService] Failed to send error log:', err);
      },
    });
  }

  error(message: string, stack?: string, context?: Record<string, any>): void {
    this.log({
      level: 'error',
      message,
      url: window.location.href,
      stack,
      context,
    });
  }

  warn(message: string, context?: Record<string, any>): void {
    this.log({
      level: 'warn',
      message,
      url: window.location.href,
      context,
    });
  }

  info(message: string, context?: Record<string, any>): void {
    this.log({
      level: 'info',
      message,
      url: window.location.href,
      context,
    });
  }
}
