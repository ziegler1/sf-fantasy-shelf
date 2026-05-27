import { Resend } from 'resend';

const resend = new Resend(process.env['RESEND_API_KEY']);

const FROM    = process.env['FROM_EMAIL']  ?? 'onboarding@resend.dev';
const APP_URL = process.env['APP_URL']     ?? 'http://localhost:4200';
const ADMIN   = process.env['ADMIN_EMAIL'] ?? '';

export async function sendApprovalRequest(userId: number, name: string, email: string, approveToken: string): Promise<void> {
  if (!ADMIN) { console.warn('[email] ADMIN_EMAIL not set, skipping approval email'); return; }

  const approveUrl = `${APP_URL}/api/auth/approve?token=${encodeURIComponent(approveToken)}`;

  await resend.emails.send({
    from:    FROM,
    to:      ADMIN,
    subject: `New registration: ${name} (${email})`,
    html: `
      <p>Someone new registered on <strong>Zig's Codex</strong> and is waiting for your approval.</p>
      <table style="border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">Name</td><td><strong>${escHtml(name)}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">Email</td><td>${escHtml(email)}</td></tr>
      </table>
      <a href="${approveUrl}"
         style="display:inline-block;padding:10px 24px;background:#3b82f6;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
        Approve Account
      </a>
      <p style="margin-top:16px;font-size:12px;color:#94a3b8">
        Or copy this link: ${approveUrl}
      </p>
      <p style="font-size:12px;color:#94a3b8">This link expires in 48 hours.</p>
    `,
  });
}

export async function sendWelcome(name: string, email: string): Promise<void> {
  await resend.emails.send({
    from:    FROM,
    to:      email,
    subject: `You're approved — welcome to Zig's Codex`,
    html: `
      <p>Hi ${escHtml(name)},</p>
      <p>Your account on <strong>Zig's Codex</strong> has been approved. You can now sign in.</p>
      <a href="${APP_URL}/login"
         style="display:inline-block;padding:10px 24px;background:#3b82f6;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
        Sign in
      </a>
    `,
  });
}

export async function sendPasswordReset(name: string, email: string, token: string): Promise<void> {
  const resetUrl = `${APP_URL}/reset-password?token=${encodeURIComponent(token)}`;

  await resend.emails.send({
    from:    FROM,
    to:      email,
    subject: `Reset your Zig's Codex password`,
    html: `
      <p>Hi ${escHtml(name)},</p>
      <p>We received a request to reset your password. Click the button below — this link expires in <strong>1 hour</strong>.</p>
      <a href="${resetUrl}"
         style="display:inline-block;padding:10px 24px;background:#3b82f6;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
        Reset Password
      </a>
      <p style="margin-top:16px;font-size:12px;color:#94a3b8">
        Or copy this link: ${resetUrl}
      </p>
      <p style="font-size:12px;color:#94a3b8">If you didn't request this, you can ignore this email.</p>
    `,
  });
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
