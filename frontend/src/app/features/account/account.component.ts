import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService, BgKey, AccentKey } from '../../core/services/theme.service';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatFormFieldModule, MatInputModule, MatButtonModule,
    MatIconModule, MatProgressSpinnerModule, MatDividerModule,
    MatTooltipModule, MatSnackBarModule,
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

  readonly backgrounds: { key: BgKey; label: string; preview: string }[] = [
    { key: 'dragon',        label: 'Dragon',        preview: 'linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%)' },
    { key: 'stained-glass', label: 'Stained Glass', preview: 'linear-gradient(135deg,#1a0a2e 0%,#3b0a1a 50%,#0a1a3b 100%)' },
    { key: 'library',       label: 'Library',       preview: 'linear-gradient(135deg,#0d0a06 0%,#2a1f0e 100%)' },
    { key: 'library2',      label: 'Library II',    preview: 'linear-gradient(135deg,#080604 0%,#1a1408 100%)' },
    { key: 'winter',        label: 'Winter',        preview: 'linear-gradient(135deg,#090c10 0%,#1a2030 100%)' },
    { key: 'space',         label: 'Space',         preview: 'radial-gradient(ellipse at top,#0d1b4b 0%,#020617 100%)' },
    { key: 'forest',        label: 'Forest',        preview: 'linear-gradient(160deg,#050f05 0%,#0a2614 100%)' },
    { key: 'nebula',        label: 'Nebula',        preview: 'radial-gradient(ellipse at top left,#3c0769 0%,#0f172a 100%)' },
    { key: 'dusk',          label: 'Dusk',          preview: 'linear-gradient(145deg,#140805 0%,#411205 100%)' },
    { key: 'none',          label: 'None',          preview: 'linear-gradient(135deg,#0f172a 0%,#0f172a 100%)' },
  ];

  readonly accents: { key: AccentKey; color: string; label: string }[] = [
    { key: 'blue',   color: '#60a5fa', label: 'Blue'   },
    { key: 'purple', color: '#a78bfa', label: 'Purple' },
    { key: 'green',  color: '#34d399', label: 'Green'  },
    { key: 'orange', color: '#fb923c', label: 'Orange' },
    { key: 'pink',   color: '#f472b6', label: 'Pink'   },
    { key: 'teal',   color: '#2dd4bf', label: 'Teal'   },
  ];

  constructor(public auth: AuthService, public theme: ThemeService, private snackBar: MatSnackBar) {}

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
