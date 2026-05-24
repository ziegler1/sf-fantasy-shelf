# Authentication & Account Management

Zig's Codex uses JWT (JSON Web Token) authentication. There is currently
one account per deployment — designed as a personal app. The schema supports
multiple users if needed in the future.

---

## Account Creation (Registration)

1. Visit the app URL — you are redirected to `/login`
2. Click **Create one** to go to `/register`
3. Enter your name, email address, and a password (minimum 8 characters)
4. Click **Create account**

**What happens behind the scenes:**

- The backend checks whether a "seed user" (the placeholder user created when
  the app was first deployed) still has an empty password
- If it does, your registration **updates that seed user** with your real
  credentials — this preserves any books or shelf data added before auth was
  set up
- If no seed user exists (someone already registered), a new user row is
  inserted with a new ID
- Your password is hashed with **bcrypt at 12 rounds** before being stored —
  the plain text is never saved anywhere or logged
- The backend returns a JWT token and you are redirected to your library

### Subsequent users

If you add another user (e.g., a family member), they register the same way
and get their own completely isolated shelf.

---

## Login & Session

1. Visit `/login`, enter your email and password, press **Sign in** or Enter
2. The backend looks up your email, runs `bcrypt.compare()` against the stored
   hash, and returns a 401 if anything doesn't match
3. On success, a **JWT signed with `JWT_SECRET`** is returned — valid for **30 days**
4. The token is stored in `localStorage` under the key `sfs_token`

### Session persistence

- On every page load, the app reads the token from `localStorage` — you stay
  logged in for 30 days without re-entering your password
- Every API request automatically includes `Authorization: Bearer <token>` via
  an HTTP interceptor
- When the 30 days are up, the next API call returns a 401 and the app
  automatically logs you out and redirects to `/login`

### Logout

- Click the **logout icon** at the bottom of the sidebar, or
- Go to **Account** in the sidebar → **Sign out** button

Both clear the token and user data from `localStorage` and redirect to `/login`.

---

## Account Settings

Everything is managed from the **Account** page (`/account`) in the sidebar.

### Edit profile

Change your display name and/or email address. Click **Save Profile** — a
toast notification confirms success or shows the error (e.g., email already
in use by another account).

### Change password

Requires your current password before accepting a new one. The confirm field
must match the new password exactly. Minimum 8 characters.

- Current password is verified with `bcrypt.compare()` server-side
- New password is hashed with bcrypt at 12 rounds before storing
- A success toast confirms the change; the session token is not invalidated
  (you stay logged in)

---

## Security Notes

| Detail | Value |
|---|---|
| Password hashing | bcrypt, 12 rounds (~300ms per hash) |
| Token format | JWT, signed with `JWT_SECRET` env var |
| Token expiry | 30 days |
| Token storage | Browser `localStorage` |
| Transport | HTTPS only (Railway + Cloudflare) |
| Expired token handling | Auto-logout + redirect to `/login` on 401 |
| Refresh tokens | Not implemented — re-login after 30 days |

### `JWT_SECRET`

Set in Railway → backend service → Variables. Use a random string of at least
32 characters. **Do not change it after users have registered** — rotating the
secret invalidates all existing tokens and logs everyone out immediately.

---

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | None | Create account |
| `POST` | `/api/auth/login` | None | Login, returns JWT |
| `GET` | `/api/auth/me` | Required | Current user info |
| `PUT` | `/api/auth/profile` | Required | Update name and/or email |
| `POST` | `/api/auth/change-password` | Required | Change password |

---

## What Is Not Built Yet

- **Forgot password / reset via email** — requires an email provider (SendGrid,
  Resend, etc.). Deferred to a future phase.
- **Account deletion** — removing your account and all associated data

These are planned for Phase 5 (Polish & Production).
