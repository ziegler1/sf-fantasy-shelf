import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink,
    MatFormFieldModule, MatInputModule, MatButtonModule,
    MatIconModule, MatProgressSpinnerModule,
  ],
  template: `
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-brand">
          <mat-icon class="brand-icon">auto_stories</mat-icon>
          <h1 class="brand-name">Zig's Codex</h1>
        </div>

        @if (sent) {
          <div class="sent-box">
            <mat-icon class="sent-icon">mark_email_read</mat-icon>
            <h2 class="sent-heading">Check your email</h2>
            <p class="sent-body">
              If <strong>{{ email }}</strong> has an account, we've sent a reset link.
              It expires in 1 hour.
            </p>
            <a routerLink="/login" class="back-link">Back to sign in</a>
          </div>
        } @else {
          <h2 class="auth-heading">Reset password</h2>
          <p class="auth-sub">Enter your email and we'll send you a reset link.</p>

          <mat-form-field appearance="outline" class="auth-field">
            <mat-label>Email</mat-label>
            <input matInput type="email" [(ngModel)]="email"
                   (keydown.enter)="submit()" autocomplete="email">
            <mat-icon matSuffix>mail</mat-icon>
          </mat-form-field>

          @if (error) {
            <p class="auth-error">{{ error }}</p>
          }

          <button mat-flat-button color="primary" class="auth-btn" (click)="submit()" [disabled]="loading">
            @if (loading) { <mat-spinner diameter="20" /> } @else { Send reset link }
          </button>

          <p class="auth-footer">
            <a routerLink="/login">Back to sign in</a>
          </p>
        }
      </div>
    </div>
  `,
  styles: [`
    .auth-page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0f172a;
      padding: 1rem;
    }
    .auth-card {
      width: 100%;
      max-width: 380px;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .auth-brand {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }
    .brand-icon { color: #60a5fa; font-size: 1.75rem; width: 1.75rem; height: 1.75rem; }
    .brand-name { font-size: 1.2rem; font-weight: 700; color: #e2e8f0; margin: 0; }
    .auth-heading { font-size: 1.5rem; font-weight: 700; color: #f1f5f9; margin: 0; }
    .auth-sub { font-size: 0.82rem; color: #64748b; margin: 0; }
    .auth-field { width: 100%; }
    .auth-error { color: #f87171; font-size: 0.82rem; margin: 0; }
    .auth-btn { width: 100%; height: 44px; font-size: 0.95rem; }
    .auth-footer { font-size: 0.82rem; color: #475569; margin: 0.25rem 0 0; text-align: center; }
    .auth-footer a, .back-link { color: #60a5fa; text-decoration: none; }
    .auth-footer a:hover, .back-link:hover { text-decoration: underline; }

    .sent-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 0.5rem;
      padding: 1rem 0;
    }
    .sent-icon { font-size: 3rem; width: 3rem; height: 3rem; color: #34d399; }
    .sent-heading { font-size: 1.25rem; font-weight: 700; color: #f1f5f9; margin: 0; }
    .sent-body { font-size: 0.875rem; color: #94a3b8; margin: 0; line-height: 1.6; }
    .sent-body strong { color: #cbd5e1; }
    .back-link { font-size: 0.82rem; margin-top: 0.5rem; }
  `],
})
export class ForgotPasswordComponent {
  email   = '';
  loading = false;
  error   = '';
  sent    = false;

  constructor(private http: HttpClient) {}

  submit(): void {
    if (!this.email || this.loading) return;
    this.loading = true;
    this.error   = '';

    this.http.post('/api/auth/forgot-password', { email: this.email }).subscribe({
      next: () => { this.loading = false; this.sent = true; },
      error: err => { this.error = err.error?.error ?? 'Something went wrong.'; this.loading = false; },
    });
  }
}
