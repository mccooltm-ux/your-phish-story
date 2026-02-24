# PostHog Funnel Setup Guide

No code changes needed — this is a configuration guide for the PostHog dashboard at https://us.posthog.com.

---

## Funnel 1: Free Snapshot Conversion

Track how many landing page visitors convert to free snapshot users.

**Steps to create in PostHog → Funnels:**

| Step | Event | Description |
|------|-------|-------------|
| 1 | `$pageview` (where `$current_url` contains `index.html` or equals `/`) | Landed on homepage |
| 2 | `snapshot_form_submit` | Submitted the free snapshot form |
| 3 | `snapshot_viewed` | Successfully viewed their snapshot |

**Breakdown by:** `ref_source` (to see which referral channels convert best)

---

## Funnel 2: Snapshot → Paid Conversion

Track the upsell from free snapshot to paid order.

| Step | Event | Description |
|------|-------|-------------|
| 1 | `snapshot_viewed` | Saw their free snapshot |
| 2 | `upsell_clicked` | Clicked the "Get Your Full Phish Story" CTA on snapshot page |
| 3 | `checkout_started` | Submitted the order form on landing page |
| 4 | `checkout_redirected` | Redirected to Stripe |
| 5 | `purchase_completed` | Landed on success page (payment complete) |

---

## Funnel 3: Direct Purchase (Skip Snapshot)

Track visitors who go straight to purchase without using the free snapshot.

| Step | Event | Description |
|------|-------|-------------|
| 1 | `$pageview` (where `$current_url` contains `index.html` or equals `/`) | Landed on homepage |
| 2 | `username_validated` | Validated their Phishnet username in the order form |
| 3 | `checkout_started` | Submitted the order form |
| 4 | `checkout_redirected` | Redirected to Stripe |
| 5 | `purchase_completed` | Payment complete |

---

## Funnel 4: Referral / Virality

Track the share → referral → conversion loop.

| Step | Event | Description |
|------|-------|-------------|
| 1 | `share_clicked` | Clicked share on success page (copy link or Twitter) |
| 2 | `referral_landing` (where `ref_source` = `friend`) | New visitor landed via referral link |
| 3 | `snapshot_form_submit` OR `checkout_started` | Referred visitor took action |

---

## Funnel 5: Waitlist Conversion

Track users who hit the order cap and join the waitlist.

| Step | Event | Description |
|------|-------|-------------|
| 1 | `checkout_started` | Submitted the order form |
| 2 | `waitlist_shown` | Order cap reached, waitlist UI displayed |
| 3 | `waitlist_joined` | User submitted their info to join waitlist |

---

## User Identification

`posthog.identify(email)` is called at two key moments:
- When a user submits the **order form** (checkout_started) — identified by email
- On **snapshot.html** load — if email is available from URL params

This stitches anonymous pageview sessions to identified users, so you can track the full journey from first visit to purchase.

---

## Key Properties to Watch

| Property | Set By | Where |
|----------|--------|-------|
| `ref_source` | `posthog.register()` on landing page | Persists across the session as a super property |
| `username` | Various events | Phishnet username |
| `email` | `posthog.identify()` | Person property, set on checkout/snapshot |
| `phishnet_username` | `posthog.identify()` | Person property |
| `total_shows` | `snapshot_viewed`, `upsell_clicked` | Show count for the user |
| `is_gift` | `checkout_started` | Whether order is a gift |
| `is_share` | `snapshot_viewed` | Whether snapshot is being viewed via share link |

---

## Dashboard Setup

Create a PostHog dashboard called **"Launch Metrics"** with these insights:

1. **Daily unique visitors** — `$pageview` unique users, daily trend
2. **Snapshot conversion rate** — Funnel 1 above
3. **Snapshot → purchase rate** — Funnel 2 above
4. **Total purchases** — `purchase_completed` count, cumulative
5. **Referral traffic** — `referral_landing` count, broken down by `ref_source`
6. **Share rate** — `share_clicked` / `purchase_completed` (what % of buyers share)
7. **Username validation failures** — `username_failed` count (friction indicator)

---

## How to Create These in PostHog

1. Go to **PostHog → Insights → New insight**
2. Select **Funnels** as the insight type
3. Add each step as listed above (use the event name from the "Event" column)
4. For step filters (like `$current_url`), click the funnel step and add a property filter
5. Set the conversion window to **7 days** (users may come back later)
6. Save to your "Launch Metrics" dashboard
7. For breakdown analysis, add a **Breakdown** by `ref_source` to Funnel 1
