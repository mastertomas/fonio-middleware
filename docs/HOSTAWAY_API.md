# Hostaway Public API — Credentials & Messaging

## Credentials in use

The middleware uses **Hostaway Public API** credentials from `.env`:

```env
HOSTAWAY_ACCOUNT_ID=...
HOSTAWAY_API_SECRET=...
```

Authentication: OAuth2 client credentials → Bearer token (`scope: general`).

These are **not** Hostaway dashboard login credentials.

## APIs used

| Area | Endpoints |
|------|-----------|
| Listings | `GET /listings` |
| Reservations | `GET /reservations` |
| Calendar | `GET /listings/{id}/calendar` |
| **Messaging / Inbox** | `GET /conversations`, `GET /conversations/{id}/messages`, `POST /conversations/{id}/messages` |
| Webhooks | `GET/POST /webhooks/unifiedWebhooks` |

## Messaging API access

Guest request forwarding posts a message to the **guest conversation inbox**:

```
POST /v1/conversations/{conversationId}/messages
Body: { "body": "...", "communicationType": "channel" }
```

**Same API credentials** as listings/reservations. There is no separate "Messaging API key" in our integration.

### How to verify

```bash
npm run test:hostaway
```

The script checks:

1. Access token
2. Listings access
3. Conversations API access (messaging)

### If messaging fails

| Symptom | Action |
|---------|--------|
| Listings OK, conversations 403 | Ask Hostaway support to enable conversation/messaging API for account `HOSTAWAY_ACCOUNT_ID` |
| Conversations empty | Normal for reservations without Hostaway inbox thread; run sync + **Link inbox & retry** in admin |
| Token errors | Verify `HOSTAWAY_ACCOUNT_ID` and `HOSTAWAY_API_SECRET` |

## Rate limits

Hostaway enforces API rate limits. The middleware:

- Caches calendars locally (availability cache-first)
- Batches reservation sync
- Uses concurrency limits on calendar sync

Do not point fonio directly at Hostaway — all traffic goes through this middleware.
