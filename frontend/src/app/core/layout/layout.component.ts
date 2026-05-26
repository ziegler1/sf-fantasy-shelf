import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { ThemeService } from '../services/theme.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
}

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive,
    MatSidenavModule, MatToolbarModule, MatListModule,
    MatIconModule, MatButtonModule, MatTooltipModule,
  ],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.css',
})
export class LayoutComponent implements OnInit, OnDestroy {
  @ViewChild('drawer') drawer!: MatSidenav;

  isHandset = false;
  private destroy$ = new Subject<void>();

  readonly navItems: NavItem[] = [
    { label: 'Dashboard',         icon: 'dashboard',       route: '/dashboard'  },
    { label: 'My Library',        icon: 'menu_book',       route: '/library'    },
    { label: 'Series Tracker',    icon: 'auto_stories',    route: '/series'     },
    { label: 'Discover',          icon: 'explore',         route: '/discover'   },
    { label: 'Upcoming Releases', icon: 'event_available', route: '/upcoming'   },
    { label: 'News Feed',         icon: 'rss_feed',        route: '/news'       },
    { label: 'Analytics',         icon: 'bar_chart',       route: '/analytics'  },
    { label: 'Account',           icon: 'manage_accounts', route: '/account'    },
  ];

  constructor(
    private breakpoints: BreakpointObserver,
    public auth: AuthService,
    public theme: ThemeService,
  ) {}

  ngOnInit(): void {
    this.breakpoints
      .observe(Breakpoints.Handset)
      .pipe(takeUntil(this.destroy$))
      .subscribe(result => { this.isHandset = result.matches; });
  }

  reload(): void {
    window.location.reload();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
