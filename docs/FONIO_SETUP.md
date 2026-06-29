# fonio.ai Integration Guide

Configure your fonio phone assistant to use this middleware.

## Quick URL reference

Get live URLs from the API:

```
GET /api/v1/fonio/setup
Header: x-api-key: <your fonio key>
```

Or after admin login:

```
GET /api/v1/admin/sync/status
```

## Local development

| fonio setting | URL |
|---------------|-----|
| Inbound webhook | `http://localhost:3000/api/v1/fonio/call-context` |
| Availability (mid-call API) | `GET http://localhost:3000/api/v1/fonio/availability` |
| Guest verify | `POST http://localhost:3000/api/v1/fonio/guest/verify` |
| Guest reservation | `GET http://localhost:3000/api/v1/fonio/guest/reservation` |
| Guest requests | `POST http://localhost:3000/api/v1/fonio/guest/requests` |

**Auth header for all fonio endpoints:** `x-api-key: <FONIO_API_KEY from .env>`

## Production (when deployed)

Replace `localhost:3000` with `https://vermietung.brainions.digital`

## fonio dashboard steps

1. Open your fonio assistant → **Edit** → **Technical**
2. **Inbound webhook:** paste `call-context` URL
3. Add **API requests during call** for:
   - Availability questions
   - Guest verification
   - Guest requests
4. Set API key header: `x-api-key`

## Suggested fonio prompt variables

After inbound webhook, fonio receives:

| Variable | Meaning |
|----------|---------|
| `caller_recognized` | Phone matched a reservation |
| `has_upcoming_booking` | Guest has active/upcoming stay |
| `guest_first_name_hint` | First name for greeting (e.g. "Falko") |
| `greeting_hint` | Ready-to-use German greeting |
| `listing_city_hint` | City of booked property |
| `reservation_id_hint` | Hostaway reservation ID (for verify step) |
| `hint_requires_verification` | Must verify before sharing details |

## Example call flow

1. **Call starts** → fonio calls `call-context` with caller phone
2. **Availability question** → fonio calls `GET /availability?city=Stuttgart&checkIn=...`
3. **Existing guest** → fonio asks reservation ID + dates → `POST /guest/verify`
4. **Guest request** (pet, extra guest) → `POST /guest/requests` with `verificationToken`
5. **Manual requests** → forwarded to Hostaway inbox automatically

## View API activity

Swagger → `GET /api/v1/admin/logs` (after admin login)

Shows `call_context`, `availability_search`, `guest_verify` events without storing PII.
