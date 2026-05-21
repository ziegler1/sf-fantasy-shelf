# Authentication & Account Management

SF Fantasy Shelf uses JWT (JSON Web Token) authentication. There is currently
one account per deployment — designed as a personal app. The schema supports
multiple users if needed in the future.

---

## How Account Creation Works

### First-time registration

1. Visit the app URL — you are redirected to `/login`
2. Click **Create one** to go to `/register`
3. Enter your name, email address, and a password (minimum 8 characters)
4. Click **Create account**

**What happens behind the scenes:**

- The backend checks whether a "seed user" (the placeholder user created when
  the app was first deployed) still has an empty password
- If it does, your registration **updates that seed user** with your real
  credentials — this is why any books or shelf data added before auth was set
  up are still attached to your account after registering
- If no seed user exists (i.e., someone already registered), a new user row is
  inserted with a new ID
- Your password is hashed with **bcrypt at 12 rounds** before being stored —
  the plain text is never saved anywhere or logged
- The backend returns a JWT token and you are redirected to your library

### Subsequent registrations

If you add another user (e.g., a family member), they register the same way
and get their own separate shelf. Their data is completely isolated from yours.

---

## How Login Works

1. Visit `/login`, enter your email and password, press **Sign in** or Enter
2. The backend looks up your email, runs `bcrypt.compare()` against the stored
   hash, and returns a 401 if anything doesn't match
3. On success, a **JWT signed with `JWT_SECRET`** is returned — valid for **7 days**
4. The token is stored in your browser's `localStorage` under the key `sfs_token`

### Session persistence

- On every page load, the app reads the token from `localStorage` — you stay
  logged in without re-entering your password
- Every API request automatically includes `Authorization: Bearer <token>` via
  an HTTP interceptor — you never need to manage this manually
- After **7 days** the token expires. The next API call returns a 401 and the
  app redirects you to `/login` to get a fresh token

### Logout

Click the **logout icon** (→) at the bottom of the sidebar. This clears the
token and user data from `localStorage` and redirects to `/login`.

---

## Changing Your Password

There is no password-change UI yet (planned for a future phase). In the
meantime, you can change your password via a direct API call.

### Using curl

```bash
curl -X POST https://backend-production-37fc.up.railway.app/api/auth/change-password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"current_password":"old","new_password":"newpassword123"}'
```

### Using PowerShell

```powershell
$token = "YOUR_TOKEN_HERE"
Invoke-RestMethod `
  -Method POST `
  -Uri "https://backend-production-37fc.up.railway.app/api/auth/change-password" `
  -Headers @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" } `
  -Body '{"current_password":"old","new_password":"newpassword123"}'
```

**To get your current token:** open browser DevTools → Application →
Local Storage → `https://sf-fantasy-shelf-production.up.railway.app` →
look for the key `sfs_token`.

---

## Security Notes

| Detail | Value |
|---|---|
| Password hashing | bcrypt, 12 rounds (~300ms per hash) |
| Token format | JWT, signed with `JWT_SECRET` env var |
| Token expiry | 7 days |
| Token storage | Browser `localStorage` |
| Transport | HTTPS only (enforced by Railway + Cloudflare) |
| Refresh tokens | Not implemented — re-login after expiry |

### `JWT_SECRET`

Set in Railway → backend service → Variables. Use a random string of at least
32 characters. **Do not change it after users have registered** — rotating the
secret invalidates all existing tokens and everyone is logged out immediately.

---

## What Is Not Built Yet

- **Password reset via email** — requires an email provider (SendGrid, Resend,
  etc.). On the roadmap for a future phase.
- **Forgot password flow** — same dependency on email
- **Profile editing** — changing your name or email address via the UI
- **Account deletion** — removing your account and all associated data

These are all deferred to Phase 5 (Polish & Production).
