import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatFormFieldModule, MatInputModule, MatButtonModule,
    MatIconModule, MatProgressSpinnerModule, MatDividerModule,
    MatSnackBarModule,
  ],
  templateUrl: './account.component.html',
})
export class AccountComponent implements OnInit {
  // Profile
  name  = '';
  email = '';
  profileSaving = false;

  // Password
  currentPassword = '';
  newPassword     = '';
  confirmPassword = '';
  passwordSaving  = false;
  hideCurrentPw   = true;
  hideNewPw       = true;
  hideConfirmPw   = true;

  constructor(public auth: AuthService, private snackBar: MatSnackBar) {}

  ngOnInit(): void {
    const user = this.auth.currentUser();
    if (user) {
      this.name  = user.name;
      this.email = user.email;
    }
  }

  saveProfile(): void {
    if (!this.name.trim() || !this.email.trim() || this.profileSaving) return;
    this.profileSaving = true;

    this.auth.updateProfile(this.name.trim(), this.email.trim()).subscribe({
      next: () => {
        this.profileSaving = false;
        this.toast('Profile updated');
      },
      error: err => {
        this.profileSaving = false;
        this.toast(err.error?.error ?? 'Failed to update profile', true);
      },
    });
  }

  savePassword(): void {
    if (!this.currentPassword || !this.newPassword || !this.confirmPassword) return;
    if (this.newPassword !== this.confirmPassword) {
      this.toast('New passwords do not match', true);
      return;
    }
    if (this.newPassword.length < 8) {
      this.toast('New password must be at least 8 characters', true);
      return;
    }
    if (this.passwordSaving) return;
    this.passwordSaving = true;

    this.auth.changePassword(this.currentPassword, this.newPassword).subscribe({
      next: () => {
        this.passwordSaving  = false;
        this.currentPassword = '';
        this.newPassword     = '';
        this.confirmPassword = '';
        this.toast('Password updated');
      },
      error: err => {
        this.passwordSaving = false;
        this.toast(err.error?.error ?? 'Failed to update password', true);
      },
    });
  }

  private toast(message: string, isError = false): void {
    this.snackBar.open(message, 'Dismiss', {
      duration: 4000,
      panelClass: isError ? 'snack-error' : 'snack-success',
      horizontalPosition: 'right',
      verticalPosition: 'bottom',
    });
  }
}
