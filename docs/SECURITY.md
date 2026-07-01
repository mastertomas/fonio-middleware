# Security & Privacy (GDPR-conscious)

This document describes how the Vermietung middleware meets security and privacy requirements.

## Principles

- **Data minimization** — fonio/public APIs never return unnecessary guest PII.
- **Secrets server-side only** — API keys and passwords exist in `.env` / Docker secrets, never in frontend code.
- **Audit trail** — API actions logged without storing raw PII in logs.
- **HTTPS in production** — TLS terminated at Caddy; app enforces secure headers and optional redirect.
- **Role-based admin** — VIEWER / EDITOR / ADMIN with least privilege.

## Credential storage

| Secret | Storage | Used by |
|--------|---------|---------|
| `FONIO_API_KEY` | Server `.env` | fonio → middleware (`x-api-key`) |
| `HOSTAWAY_API_SECRET` | Server `.env` | Hostaway Public API |
| `JWT_SECRET` | Server `.env` | Admin session tokens |
| `ADMIN_PASSWORD` | Server `.env` (bootstrap only) | Initial admin hash in DB |
| `HOSTAWAY_WEBHOOK_USERNAME/PASSWORD` | Server `.env` | Webhook Basic Auth |

The admin UI (`/admin`) stores only a **JWT** in `localStorage` — no API keys.

## Personal data exposure

### fonio endpoints (public via API key)

| Endpoint | PII policy |
|----------|------------|
| `call-context` | No reservation ID; first name hint for greeting only |
| `availability` | No guest data; listing names/cities only |
| `guest/verify` | Guest supplies data; response is minimal post-verify summary |
| `guest/reservation` | Requires JWT verification token; safe fields only |
| `guest/requests` | Stores hashed caller phone only |

### Admin endpoints

| Role | Reservations contact data |
|------|---------------------------|
| `VIEWER` | Masked name, email, phone |
| `EDITOR` / `ADMIN` | Full contact (for operations) |

Guest phones in DB are hashed (`phoneHash`) for lookup; raw phone stored encrypted-at-rest via database access controls.

## Admin roles

| Role | Permissions |
|------|-------------|
| **VIEWER** | Read listings, reservations (masked), rules, logs, guest requests |
| **EDITOR** | + sync, edit rules/verification, inbox retry, conversations |
| **ADMIN** | + delete rules, sync settings, register Hostaway webhooks |

Default bootstrap user: `ADMIN` (from `ADMIN_EMAIL` / `ADMIN_PASSWORD`).

## API action logging

Logged to `ApiLog` table (see **Admin → API audit log**):

- fonio: call context, availability, verify, reservation, guest requests
- Hostaway webhooks (event type + object ID only)
- Admin: login success/failure, all mutating admin actions
- IPs stored as **hashed** (`ipHash`)

Retention (configurable):

```env
LOG_RETENTION_DEBUG_DAYS=14
LOG_RETENTION_OPERATIONAL_DAYS=30
LOG_RETENTION_PII_DAYS=30
```

Expired logs purged daily at 03:00.

## Error handling

- Global exception filter returns consistent JSON: `{ statusCode, message, timestamp, path }`
- Production **500** responses do not leak stack traces
- Validation errors return field-level messages (class-validator)

## HTTPS

**Production** (`docker-compose.prod.yml` + Caddy):

- Automatic TLS certificates for `vermietung.brainions.digital`
- Set `FORCE_HTTPS=true` to redirect HTTP → HTTPS at app level
- `Strict-Transport-Security` header in production
- `trust proxy` enabled for correct secure detection behind Caddy

**Local dev** uses HTTP on `localhost` only.

## Security headers

Applied on every response:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` (restricts camera/mic/geo)

## Login protection

- bcrypt password hashes (cost 12)
- Rate limit: 10 failed attempts per email / 15 minutes
- Failed logins audited as `SECURITY` events

## API documentation

Interactive OpenAPI docs: **`GET /docs`** (Swagger UI)

Disable in production if desired:

```env
SWAGGER_ENABLED=false
```

All endpoints are tagged: `fonio`, `admin`, `admin-auth`, `webhooks`, `health`.

## Checklist for deployment

- [ ] Change `JWT_SECRET`, `ADMIN_PASSWORD`, `FONIO_API_KEY` from defaults
- [ ] Set `NODE_ENV=production`
- [ ] Set `FORCE_HTTPS=true`
- [ ] Configure `HOSTAWAY_WEBHOOK_USERNAME/PASSWORD`
- [ ] Restrict admin UI access (VPN or IP allowlist at reverse proxy if required)
- [ ] Regular Postgres backups (see `docs/DEPLOYMENT.md`)
