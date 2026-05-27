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
  selector: 'app-register',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink,
    MatFormFieldModule, MatInputModule, MatButtonModule,
    MatIconModule, MatProgressSpinnerModule,
  ],
  templateUrl: './register.component.html',
})
export class RegisterComponent {
  name        = '';
  email       = '';
  password    = '';
  inviteCode  = '';
  loading     = false;
  error       = '';
  pending     = false;
  hidePassword = true;

  constructor(private http: HttpClient) {}

  submit(): void {
    if (!this.name || !this.email || !this.password || !this.inviteCode || this.loading) return;
    this.loading = true;
    this.error   = '';

    this.http.post<{ token?: string; user?: object; pending?: boolean }>(
      '/api/auth/register',
      { email: this.email, name: this.name, password: this.password, inviteCode: this.inviteCode },
    ).subscribe({
      next: res => {
        this.loading = false;
        if (res.pending) {
          this.pending = true;
        }
        // If token is present (first user / owner), redirect to library
        if (res.token && res.user) {
          localStorage.setItem('sfs_token', res.token);
          localStorage.setItem('sfs_user', JSON.stringify(res.user));
          window.location.href = '/library';
        }
      },
      error: err => {
        this.error   = err.error?.error ?? 'Registration failed. Please try again.';
        this.loading = false;
      },
    });
  }
}
