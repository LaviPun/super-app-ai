# Email notifications & delivery

App-side transactional email (support alerts, merchant ticket updates, admin test
sends) goes through a single mailer: `apps/web/app/services/notifications/mailer.server.ts`.

Contract (unchanged for callers): `sendEmail({ to, subject, html, text? })` returns
`{ sent: boolean; error?: string }` and **never throws** — email is strictly
best-effort. `resolveMailerStatus()` reports `{ configured, provider, from }` for the
admin UI.

## Configuration precedence: DB first, env fallback

Delivery is configured from the internal admin UI (**Settings → Advanced → Email
delivery**) and persisted on the `AppSettings` singleton row. Each field resolves
**DB value if set, else the matching `EMAIL_*` / `SMTP_*` environment variable**, so
a deployment can be configured entirely from the UI, entirely from env, or a mix.
Secrets (`emailApiKeyEnc`, `smtpPassEnc`) are stored AES-GCM-encrypted via
`encryptJson({ apiKey })` / `encryptJson({ pass })` and are never returned to the
client or written to the audit log.

When no sender address and no provider credentials resolve from either source, the
mailer is disabled: it returns `{ sent: false, error: 'mailer not configured' }`
after a single `console.warn`.

## Providers

| Provider   | Transport            | Required fields (DB column / env fallback)                          |
|------------|----------------------|---------------------------------------------------------------------|
| `smtp`     | nodemailer (SMTP)    | `smtpHost`/`SMTP_HOST`, `emailFrom`/`EMAIL_FROM`; optional `smtpPort`/`SMTP_PORT`, `smtpUser`/`SMTP_USER`, `smtpPass*`/`SMTP_PASS`, `smtpSecure`/`SMTP_SECURE` |
| `sendgrid` | SendGrid v3 (fetch)  | `emailApiKeyEnc`/`EMAIL_API_KEY`, `emailFrom`/`EMAIL_FROM`; `emailApiUrl` defaults to `https://api.sendgrid.com/v3/mail/send` |
| `generic`  | JSON HTTP API (fetch)| `emailApiUrl`/`EMAIL_API_URL`, `emailApiKeyEnc`/`EMAIL_API_KEY`, `emailFrom`/`EMAIL_FROM` |

- `emailProvider = null` (UI: “Not configured (use env)”) infers the provider from
  env, mirroring the workflow EmailConnector: `EMAIL_CONNECTOR_PROVIDER` (`sendgrid`
  default | `generic`), or `generic` when only `EMAIL_API_URL` is set. Env has no
  `smtp` option — SMTP must be selected in the DB/UI.
- SMTP port defaults to 465 when `smtpSecure` is on, else 587. All SMTP timeouts
  (connection/greeting/socket) are 15s.
- Fetch providers honour `EMAIL_API_KEY_HEADER` (default `Authorization`) and
  `EMAIL_API_KEY_PREFIX` (default `Bearer ` for Authorization) for auth headers.

## Test send

Settings → Advanced → Email delivery has a **Send test email** row (intent
`send_test_email`). It calls `sendEmail` with a one-line message and surfaces the
result as a toast (`Test email sent to <addr>` or the provider error). A successful
test is audited as `SUPPORT_NOTIFICATION_SENT` with `details: { kind: 'test' }`.
Saving delivery settings is audited as `SETTINGS_CHANGE` with
`details: { section: 'email_delivery', provider }` — secrets are never included.

## Support-event notifications

`services/support/notifications.server.ts` is a `sendEmail` consumer: admin alerts
(gated by `enableEmailAlerts` + `alertRecipients`) and merchant ticket updates (owner
email fetched live from the Shopify Admin API). Its call signature is unchanged by the
configurable-delivery work.
