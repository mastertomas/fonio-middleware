# Production Deployment

Deploy the middleware to **vermietung.brainions.digital** using Docker Compose + Caddy (automatic HTTPS).

## Prerequisites

- Linux VPS (Ubuntu 22.04+ recommended) with Docker and Docker Compose v2
- DNS A record: `vermietung.brainions.digital` → server IP
- Hostaway API credentials
- fonio.ai API key

## 1. Server setup

```bash
# Install Docker (Ubuntu)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in
```

Clone the repository on the server:

```bash
git clone <your-repo-url> vermietung-middleware
cd vermietung-middleware
```

## 2. Environment

Copy and edit `.env`:

```bash
cp .env.example .env
nano .env
```

**Required production values:**

| Variable | Example |
|----------|---------|
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `DOMAIN` | `vermietung.brainions.digital` |
| `PRODUCTION_URL` | `https://vermietung.brainions.digital` |
| `APP_URL` | `https://vermietung.brainions.digital` |
| `POSTGRES_PASSWORD` | strong random password |
| `HOSTAWAY_ACCOUNT_ID` | your account ID |
| `HOSTAWAY_API_SECRET` | your API secret |
| `FONIO_API_KEY` | long random string (share with fonio config only) |
| `JWT_SECRET` | long random string |
| `ADMIN_EMAIL` | admin login email |
| `ADMIN_PASSWORD` | strong admin password |
| `SYNC_ENABLED` | `true` |
| `HOSTAWAY_WEBHOOK_USERNAME` | webhook basic auth user |
| `HOSTAWAY_WEBHOOK_PASSWORD` | webhook basic auth password |

> `DATABASE_URL` is overridden in `docker-compose.prod.yml` to use the internal Postgres container.

## 3. Deploy

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Check logs:

```bash
docker compose -f docker-compose.prod.yml logs -f api
```

On first start the entrypoint runs `prisma migrate deploy` and seeds the admin user (if none exists).

## 4. Verify

- Health: `https://vermietung.brainions.digital/health`
- Swagger: `https://vermietung.brainions.digital/docs`
- Admin UI: `https://vermietung.brainions.digital/admin`
- fonio setup URLs: Admin → **fonio Setup** tab

Trigger initial Hostaway sync from the admin dashboard or:

```bash
curl -X POST https://vermietung.brainions.digital/api/v1/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@brainions.digital","password":"YOUR_PASSWORD"}'

curl -X POST https://vermietung.brainions.digital/api/v1/admin/sync \
  -H "Authorization: Bearer YOUR_JWT"
```

## 5. Hostaway webhooks

### Option A — Admin API (no Hostaway dashboard login)

After deploy and admin login:

```bash
# List existing webhooks in Hostaway
curl https://vermietung.brainions.digital/api/v1/admin/sync/hostaway-webhooks \
  -H "Authorization: Bearer YOUR_JWT"

# Register production webhook (uses PRODUCTION_URL + HOSTAWAY_WEBHOOK_* from .env)
curl -X POST https://vermietung.brainions.digital/api/v1/admin/sync/register-webhook \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Option B — Hostaway dashboard

In Hostaway → Settings → Webhooks, add:

| Field | Value |
|-------|-------|
| URL | `https://vermietung.brainions.digital/webhooks/hostaway` |
| Auth | Basic (`HOSTAWAY_WEBHOOK_USERNAME` / `HOSTAWAY_WEBHOOK_PASSWORD`) |

## 6. fonio.ai configuration

See [FONIO_SETUP.md](./FONIO_SETUP.md). Use production URLs from the admin **fonio Setup** tab.

**Inbound webhook (call start):**

```
POST https://vermietung.brainions.digital/api/v1/fonio/call-context
Header: x-api-key: <FONIO_API_KEY>
```

## 7. Updates

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Migrations run automatically on container start.

## 8. Backups

Back up the Postgres volume regularly:

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U vermietung vermietung > backup-$(date +%F).sql
```

## Local development with ngrok (fonio testing)

fonio cannot reach `localhost`. For testing before production:

```bash
ngrok http 3000
```

Use the ngrok HTTPS URL as `APP_URL` in `.env` and configure fonio with that base URL.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Caddy certificate error | Ensure DNS points to server; ports 80/443 open |
| API won't start | Check `docker compose -f docker-compose.prod.yml logs api` |
| Empty listings | Run admin sync; verify Hostaway credentials |
| fonio 401 | Check `x-api-key` matches `FONIO_API_KEY` in `.env` |
