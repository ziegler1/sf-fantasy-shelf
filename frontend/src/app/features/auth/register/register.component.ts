import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../../core/services/auth.service';

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
  name     = '';
  email    = '';
  password = '';
  loading  = false;
  error    = '';
  hidePassword = true;

  constructor(private auth: AuthService, private router: Router) {}

  submit(): void {
    if (!this.name || !this.email || !this.password || this.loading) return;
    this.loading = true;
    this.error   = '';

    this.auth.register(this.email, this.name, this.password).subscribe({
      next: () => this.router.navigate(['/library']),
      error: err => {
        this.error   = err.error?.error ?? 'Registration failed. Please try again.';
        this.loading = false;
      },
    });
  }
}
