# Hostaway Webhooks Setup

## What Hostaway sends automatically

After you configure a **Unified Webhook** in Hostaway, Hostaway will **automatically POST** to your middleware URL when these events occur:

| Event | When it fires |
|-------|----------------|
| `reservation created` | New booking in Hostaway (any channel) |
| `reservation updated` | Existing reservation changed (dates, status, guests, **payment status**, etc.) |
| `new message received` | New guest message in a conversation |

**Important:** Hostaway unified webhooks do **not** include listing create/update events. Listing changes are picked up by:

- Manual **Hostaway Sync** in admin
- **Auto sync** (configurable interval on Dashboard)
- Full scheduled sync jobs

## What our middleware does

1. Receives `POST /webhooks/hostaway`
2. Validates Basic Auth (if `HOSTAWAY_WEBHOOK_USERNAME` / `HOSTAWAY_WEBHOOK_PASSWORD` are set)
3. Runs a **partial reservation sync** (last 7 days → +180 days window) for reservation events
4. When a webhook includes a reservation ID, checks **guest payment charges** in Hostaway and posts an inbox note for any newly paid charge (bank transfer, Stripe, manual mark-as-paid, etc.)
5. Logs the event in **Dashboard → Hostaway webhook activity**

**No popup notification** — the dashboard shows webhook history. With auto-refresh enabled on the Dashboard tab, new events appear within ~15 seconds.

## Configure in Hostaway Dashboard

1. Log in to [Hostaway Dashboard](https://dashboard.hostaway.com/)
2. Go to **Settings → Integrations** (or **Settings → API / Webhooks**)
3. Create a **Unified Webhook**
4. Set:

| Field | Value |
|-------|--------|
| **URL** | `https://vermietung.brainions.digital/webhooks/hostaway` |
| **Login** | Same as `HOSTAWAY_WEBHOOK_USERNAME` in `.env` |
| **Password** | Same as `HOSTAWAY_WEBHOOK_PASSWORD` in `.env` |
| **Recipient email** | Your ops email (for delivery failure alerts) |

5. Save and use Hostaway’s **Test webhook** if available
6. Create or update a test reservation — check **Admin → Dashboard → Webhook activity**

## Local development

Hostaway cannot reach `localhost`. Use ngrok:

```bash
ngrok http 3000
```

Webhook URL: `https://YOUR-NGROK-ID.ngrok.io/webhooks/hostaway`

## Raw guest data

The **Hostaway Public API returns full guest contact data** (phone, email, name) in reservation responses. Our middleware:

- Stores **raw data** in PostgreSQL (admin only)
- Stores **hashed/masked copies** for fonio/caller lookup
- Never exposes raw PII to fonio API responses

Run a **full Hostaway Sync** after deploy to populate all reservations and conversations.

## Verifying listing groups & conversations

| What | Where in admin |
|------|----------------|
| Listing groups (Bergdomizil, Kornberg, etc.) | **Groups** tab |
| Listings with group column | **Listings** tab |
| Reservations with phone/email | **Reservations** tab |
| Conversation ID + message preview | **Conversations** tab → **View** / **Refresh** |

Conversation ID is fetched from Hostaway during sync. Use **Refresh** on the Conversations tab if a new reservation has no ID yet.

## Cross-listing groups (limitation)

Hostaway **cross-listing** parent/child relationships (e.g. Bergdomizil) are configured in the Hostaway UI and are **not fully exposed** via the Public API. Our middleware:

1. Uses **config** (`listing-hierarchy.config.ts`) for known cross-listings
2. Auto-detects **multi-unit** parents via `GET /listingUnits/{id}` API
3. Merges both into the **Groups** tab

If you add new cross-listing groups in Hostaway, update `listing-hierarchy.config.ts` or contact support to add detection.
