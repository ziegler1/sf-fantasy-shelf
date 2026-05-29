import { ErrorHandler, Injectable, Injector } from '@angular/core';
import { LoggingService } from '../services/logging.service';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  constructor(private injector: Injector) {}

  handleError(error: Error | any): void {
    const logging = this.injector.get(LoggingService);

    const message = error?.message || String(error) || 'Unknown error';
    const stack = error?.stack || '';

    // Log to Remote (Railway)
    logging.error(message, stack, {
      type: error?.name,
      timestamp: new Date().toISOString(),
    });

    // Also log to console for development
    console.error('Global error caught:', error);
  }
}
