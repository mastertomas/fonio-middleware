# Monitoring & Error Logging

## Health endpoint

```
GET https://vermietung.brainions.digital/health
```

Response:

```json
{
  "status": "ok",
  "service": "vermietung-middleware",
  "checks": { "database": "ok" },
  "sync": {
    "lastCompletedAt": "...",
    "lastJobType": "auto_sync",
    "lastFailedAt": null,
    "lastError": null
  }
}
```

- `status: degraded` — database unreachable
- Docker healthcheck uses this endpoint (see `docker-compose.prod.yml`)

## Docker logs

```bash
docker compose -f docker-compose.prod.yml logs -f api
```

Server errors (HTTP 500) are logged with stack traces here (not exposed to API clients in production).

## Audit log (application)

**Admin → API audit log** — fonio actions, webhooks, admin mutations, login events.

- No raw PII (IPs hashed)
- Retention per `docs/SECURITY.md`
- Purged automatically daily

## Recommended external monitoring

| Check | Interval | Alert if |
|-------|----------|----------|
| `GET /health` | 1–5 min | `status != ok` |
| Docker container | 1 min | api container down |
| Disk space | daily | &lt; 20% free |

Optional: UptimeRobot, Hetrix, or Prometheus + blackbox exporter pointing at `/health`.

## Sync failures

Check admin **Dashboard** for last sync job. If `lastFailedAt` is set in `/health`, review:

```bash
docker compose -f docker-compose.prod.yml logs api | tail -100
```

Re-trigger sync from admin when Hostaway credentials or network are fixed.
