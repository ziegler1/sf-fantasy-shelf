import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { ThemeService } from './theme.service';

export interface AuthUser {
  id: number;
  email: string;
  name: string;
}

interface AuthResponse {
  token: string;
  user: AuthUser;
}

const TOKEN_KEY = 'sfs_token';
const USER_KEY  = 'sfs_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _user = signal<AuthUser | null>(this.loadUser());
  readonly currentUser = this._user.asReadonly();
  readonly isLoggedIn  = computed(() => this._user() !== null);

  constructor(private http: HttpClient, private router: Router, private theme: ThemeService) {}

  register(email: string, name: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/auth/register', { email, name, password })
      .pipe(tap(res => this.store(res)));
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/auth/login', { email, password })
      .pipe(tap(res => this.store(res)));
  }

  updateProfile(name: string, email: string): Observable<AuthUser> {
    return this.http.put<AuthUser>('/api/auth/profile', { name, email }).pipe(
      tap(user => {
        const updated = { ...this._user()!, name: user.name, email: user.email };
        localStorage.setItem(USER_KEY, JSON.stringify(updated));
        this._user.set(updated);
      }),
    );
  }

  changePassword(current_password: string, new_password: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>('/api/auth/change-password', {
      current_password, new_password,
    });
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this._user.set(null);
    this.theme.resetToDefaults();
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  private store(res: AuthResponse): void {
    localStorage.setItem(TOKEN_KEY, res.token);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    this._user.set(res.user);
    this.theme.loadForUser(res.user.id);
  }

  private loadUser(): AuthUser | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
}
