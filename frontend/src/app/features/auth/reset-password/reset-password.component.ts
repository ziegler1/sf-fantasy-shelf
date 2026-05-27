import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-reset-password',
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

        @if (!token) {
          <p class="auth-error">Invalid reset link. Please request a new one.</p>
          <a routerLink="/forgot-password" class="auth-footer-link">Request reset link</a>
        } @else if (done) {
          <div class="done-box">
            <mat-icon class="done-icon">check_circle</mat-icon>
            <h2 class="done-heading">Password updated!</h2>
            <p class="done-body">Your password has been changed. You can now sign in.</p>
            <a routerLink="/login" class="back-link">Sign in</a>
          </div>
        } @else {
          <h2 class="auth-heading">New password</h2>

          <mat-form-field appearance="outline" class="auth-field">
            <mat-label>New password</mat-label>
            <input matInput [type]="hidePw ? 'password' : 'text'"
                   [(ngModel)]="password" (keydown.enter)="submit()" autocomplete="new-password">
            <button mat-icon-button matSuffix (click)="hidePw = !hidePw" type="button">
              <mat-icon>{{ hidePw ? 'visibility_off' : 'visibility' }}</mat-icon>
            </button>
            <mat-hint>Minimum 8 characters</mat-hint>
          </mat-form-field>

          <mat-form-field appearance="outline" class="auth-field">
            <mat-label>Confirm new password</mat-label>
            <input matInput [type]="hidePw ? 'password' : 'text'"
                   [(ngModel)]="confirm" (keydown.enter)="submit()" autocomplete="new-password">
          </mat-form-field>

          @if (error) {
            <p class="auth-error">{{ error }}</p>
          }

          <button mat-flat-button color="primary" class="auth-btn" (click)="submit()" [disabled]="loading">
            @if (loading) { <mat-spinner diameter="20" /> } @else { Set new password }
          </button>
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
    .auth-heading { font-size: 1.5rem; font-weight: 700; color: #f1f5f9; margin: 0 0 0.5rem; }
    .auth-field { width: 100%; }
    .auth-error { color: #f87171; font-size: 0.82rem; margin: 0; }
    .auth-btn { width: 100%; height: 44px; font-size: 0.95rem; }
    .auth-footer-link, .back-link { color: #60a5fa; text-decoration: none; font-size: 0.82rem; }
    .auth-footer-link:hover, .back-link:hover { text-decoration: underline; }

    .done-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 0.5rem;
      padding: 1rem 0;
    }
    .done-icon { font-size: 3rem; width: 3rem; height: 3rem; color: #34d399; }
    .done-heading { font-size: 1.25rem; font-weight: 700; color: #f1f5f9; margin: 0; }
    .done-body { font-size: 0.875rem; color: #94a3b8; margin: 0; }
    .back-link { margin-top: 0.5rem; }
  `],
})
export class ResetPasswordComponent implements OnInit {
  token    = '';
  password = '';
  confirm  = '';
  loading  = false;
  error    = '';
  done     = false;
  hidePw   = true;

  constructor(private http: HttpClient, private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
  }

  submit(): void {
    if (!this.password || !this.confirm || this.loading) return;
    if (this.password !== this.confirm) { this.error = 'Passwords do not match.'; return; }
    if (this.password.length < 8) { this.error = 'Password must be at least 8 characters.'; return; }

    this.loading = true;
    this.error   = '';

    this.http.post('/api/auth/reset-password', { token: this.token, password: this.password }).subscribe({
      next: () => { this.loading = false; this.done = true; },
      error: err => { this.error = err.error?.error ?? 'Something went wrong.'; this.loading = false; },
    });
  }
}
