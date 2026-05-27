import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink,
    MatFormFieldModule, MatInputModule, MatButtonModule,
    MatIconModule, MatProgressSpinnerModule,
  ],
  templateUrl: './login.component.html',
})
export class LoginComponent implements OnInit {
  email    = '';
  password = '';
  loading  = false;
  error    = '';
  notice   = '';
  hidePassword = true;

  constructor(private auth: AuthService, private router: Router, private route: ActivatedRoute) {}

  ngOnInit(): void {
    if (this.route.snapshot.queryParamMap.get('approved') === 'error') {
      this.error = 'Approval link is invalid or expired. Ask the admin to resend.';
    }
  }

  submit(): void {
    if (!this.email || !this.password || this.loading) return;
    this.loading = true;
    this.error   = '';
    this.notice  = '';

    this.auth.login(this.email, this.password).subscribe({
      next: () => this.router.navigate(['/library']),
      error: err => {
        this.error   = err.error?.error ?? 'Login failed. Please try again.';
        this.loading = false;
      },
    });
  }
}
