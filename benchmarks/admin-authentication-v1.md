# Admin Authentication v1

Date: 2026-07-27

- Production /admin requires password authentication.
- Unauthenticated users are redirected to /admin/login.
- Password verification uses ADMIN_PASSWORD_HASH.
- Sessions use a signed 24-hour HttpOnly cookie.
- Production cookies are Secure and SameSite=Strict.
- Logout clears the administrator session.
- Knowledge APIs enforce server-side authentication.
- Admin pages are noindex/nofollow.
- Temporary diagnostic endpoints and environment disclosures are removed.
- Lint and production build pass.
- Real secrets are excluded from Git and backup archives.
