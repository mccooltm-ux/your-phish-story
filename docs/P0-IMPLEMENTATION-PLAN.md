# P0 Implementation Plan — Launch & Validate Demand

## Context

MyPhisHistory is a semi-automated product that turns a Phish fan's show history into a personalized $25 PDF. The MVP is live: free snapshot tier, Stripe checkout, manual PDF generation workflow. **P0 goal: prove people will pay — get to 20 orders and learn what customers love.**

This plan covers the code changes needed to make the landing page launch-ready, instrument the funnel, enable distribution, and improve manual operations. Shipping in 3 waves over ~10 days.

## Decisions Made

- **Analytics:** PostHog (free tier — 1M events/mo, funnels, session replay)
- **Vercel plan:** Hobby (free) — 1 cron job available (daily)
- **Feedback form:** Deferred — follow-up email will ask for a direct reply instead
- **Shipping:** 3 phased waves

---

## Wave 1: Launch Readiness (Ship Day 1-2)

Bug fixes, social sharing meta tags, and sample preview improvements. Get the page ready for eyeballs.

### 1.1 Fix Known Bugs

| File | Fix |
|------|-----|
| `public/admin.html` | Refund modal says "$20" → change to "$25" |
| `api/create-checkout-session.js` | Comment says `$20.00` → update to `$25.00` |

### 1.2 OG Meta Tags + Twitter Cards

**File:** `public/index.html` (add to `<head>`)

Add:
```html
<meta property="og:image" content="https://myphishistory.com/images/og-preview.jpg">
<meta property="og:url" content="https://myphishistory.com">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="MyPhisHistory">
<meta name="twitter:description" content="Your complete Phish show history, turned into a personalized PDF.">
<meta name="twitter:image" content="https://myphishistory.com/images/og-preview.jpg">
```

**Design dependency:** Need to create `og-preview.jpg` (1200x630px). Composite from existing sample images or create a branded card.

### 1.3 Add 4th Sample Card

**File:** `public/index.html` (samples grid section)

Add the era analysis sample (`sample-eras.jpg` already exists in `/public/images/`) as a 4th card alongside the existing 3 (show history, letter, numbers). Strong selling point currently not shown.

### 1.4 Sample Image Lightbox

**File:** `public/index.html`

Add click-to-enlarge on sample preview cards. Lightweight pure-CSS/JS lightbox (no library needed). Users can see full-resolution sample pages before buying.

### 1.5 Snapshot Page Font Alignment

**File:** `public/snapshot.html`

Snapshot page uses Georgia serif while the main site uses Inter/DM Serif Display. Align to the main design system for brand consistency.

### Wave 1 Files to Modify
- `public/index.html` — OG tags, 4th sample card, lightbox, dead code cleanup
- `public/snapshot.html` — font alignment
- `public/admin.html` — $20 → $25 fix
- `api/create-checkout-session.js` — comment fix
- `public/images/og-preview.jpg` — new asset (design task)

---

## Wave 2: Analytics + Distribution Hooks (Ship Day 3-5)

Instrument the funnel with PostHog, make snapshots shareable, add share CTAs.

### 2.1 PostHog Integration

**File:** `public/index.html`, `public/snapshot.html`, `public/success.html`

Add PostHog snippet to all customer-facing pages (not admin). Single `<script>` tag in `<head>`.

Track custom events at key funnel points:

| Event | Trigger | Page |
|-------|---------|------|
| `snapshot_form_submit` | Free snapshot form submitted | index.html |
| `username_validated` | Phishnet username check succeeds | index.html |
| `username_failed` | Phishnet username check fails | index.html |
| `checkout_started` | Order form submitted | index.html |
| `checkout_redirected` | Stripe redirect fires | index.html |
| `snapshot_viewed` | Snapshot results render | snapshot.html |
| `upsell_clicked` | "Get Full PDF" CTA clicked on snapshot | snapshot.html |
| `purchase_completed` | Success page loads | success.html |
| `share_clicked` | Any share button clicked | success.html |

Implementation: `posthog.capture('event_name', { username, ... })` at each trigger point. Non-blocking, fire-and-forget.

### 2.2 Shareable Snapshot URLs

**Files:** `public/snapshot.html`, `api/generate-snapshot.js`

Add a "Share Your Stats" button to snapshot results that copies a clean URL:
`https://myphishistory.com/snapshot.html?username=jfishman&share=true`

When `share=true`:
- Skip email requirement in the UI
- Make email optional in `generate-snapshot.js` (skip lead notification email)
- Show the snapshot stats but with a prominent CTA to get their own

This turns every snapshot into a free social media impression.

### 2.3 Share Buttons on Success Page

**File:** `public/success.html`

After purchase confirmation, add:
- "Know another phan?" sharing section
- Copy link button (with UTM: `?ref=friend`)
- Twitter/X share button with pre-filled text

Track share clicks via PostHog (`share_clicked` event with `method: 'copy'|'twitter'`).

### 2.4 Mobile UX Audit & Fixes

**File:** `public/index.html`, `public/snapshot.html`

Key areas to check and fix:
- Gift toggle section (inline styles that may not scale)
- Snapshot section (fixed rem values, different font)
- Contact modal form inputs (touch target sizes)
- Sample grid on narrow screens (< 360px)
- Order form on mobile Safari/Chrome

### Wave 2 Files to Modify
- `public/index.html` — PostHog snippet, custom events, mobile fixes
- `public/snapshot.html` — PostHog, share button, share=true mode, mobile fixes
- `public/success.html` — PostHog, share buttons
- `api/generate-snapshot.js` — make email optional for share mode

### Wave 2 New Dependencies
- PostHog JS snippet (loaded via CDN `<script>` tag, not an npm dep)

---

## Wave 3: Follow-Up Email + Admin Improvements (Ship Day 6-10)

Automated customer follow-up and operational improvements for Ted.

### 3.1 Follow-Up Email Cron

**New file:** `api/cron/follow-up.js`

Daily cron job (Vercel Hobby plan: 1 cron, daily at 2pm UTC / 10am ET):

1. Query Stripe for completed payment intents with `fulfillment_status: 'delivered'`
2. Filter to orders where `delivered_at` is 3+ days ago
3. Skip orders where `follow_up_sent: 'true'` in metadata
4. Send follow-up email via Resend (reply-to: Ted's email)
5. Update Stripe metadata: `follow_up_sent: 'true'`
6. Process max 5 orders per invocation (stay under 10s timeout)

**Email content (simple, reply-friendly):**
```
Subject: How'd we do, {username}?

Hey {first_name or username},

You got your MyPhisHistory a few days ago — just checking in.

What was your favorite part? Anything we should do differently?

Just hit reply — I read every response.

— Ted
MyPhisHistory
```

No formal feedback form — just ask for a reply. Lower friction, more authentic for a niche community product.

**Vercel cron config addition to `vercel.json`:**
```json
{
  "crons": [
    {
      "path": "/api/cron/follow-up",
      "schedule": "0 14 * * *"
    }
  ]
}
```

### 3.2 Admin Notification Email Improvements

**File:** `api/webhook.js`

Enhance the order notification email Ted receives:
- Add `full_name` from metadata (captured but not currently displayed)
- Add direct link to admin panel (`https://myphishistory.com/admin.html`)
- Add estimated delivery deadline (48h from order)
- Show count badge prominently at top for quick complexity assessment

### 3.3 Admin Panel Enhancements

**Files:** `public/admin.html`, `api/admin/orders.js`

- Pass through `delivered_at` and `follow_up_sent` from Stripe metadata in orders API
- Display delivery timestamp on admin panel
- Show "Overdue" badge for orders pending > 48 hours
- Fix existing $20 → $25 in refund modal (covered in Wave 1)

### Wave 3 New Files
- `api/cron/follow-up.js` (~70 lines)

### Wave 3 Files to Modify
- `api/webhook.js` — notification email improvements
- `public/admin.html` — timestamp display, overdue warnings
- `api/admin/orders.js` — pass through additional metadata
- `vercel.json` — add cron configuration

### Wave 3 New Env Vars
- `CRON_SECRET` — Vercel auto-provides this for cron endpoint protection

---

## What's NOT in This Plan (Deferred)

| Item | Why Deferred | When to Revisit |
|------|-------------|-----------------|
| Formal feedback form (Tally/Google) | User chose to defer. Reply-based feedback is simpler. | If reply rate is low after 10 orders |
| NPS scoring | No form = no structured data. Assess from reply sentiment. | P1 when volume justifies it |
| Real testimonials | Need actual customers first | After 3-5 delivered orders |
| Order count in Early Access badge | Static text is fine for P0 volumes | After 10+ orders |
| Copy optimization | Need analytics data to know what to change | After PostHog shows drop-off patterns |
| Printed version | FAQ mentions "coming soon" — leave as-is | P2 per roadmap |
| A/B price testing | Need traffic volume first | P1 per roadmap |

---

## Verification

### Wave 1
- [ ] OG tags render correctly: test with https://opengraph.xyz or Twitter Card Validator
- [ ] 4th sample card displays in grid, lightbox opens/closes on all cards
- [ ] snapshot.html fonts match index.html design system
- [ ] admin.html shows "$25" in refund modal

### Wave 2
- [ ] PostHog dashboard shows events firing on each page
- [ ] Funnel visualization works: snapshot_form_submit → checkout_started → purchase_completed
- [ ] Session replay captures user sessions
- [ ] Shareable snapshot URL works without email param (?share=true)
- [ ] Share buttons on success.html copy correct URL with UTM
- [ ] Mobile: test checkout flow on iPhone Safari and Android Chrome

### Wave 3
- [ ] Cron endpoint responds to GET request (Vercel cron uses GET)
- [ ] Follow-up email sends correctly for test orders 3+ days old
- [ ] Stripe metadata updates with `follow_up_sent: true` after email sends
- [ ] Admin notification email shows full_name and admin link
- [ ] Admin panel shows delivery timestamps and overdue badges
- [ ] Cron doesn't re-email orders that already received follow-up

---

## Risk Notes

1. **Vercel Hobby cron limit:** 1 cron job, daily only. If we need more crons later (P1 automation), will need Pro ($20/mo) or external scheduler
2. **PostHog free tier:** 1M events/mo, 5K session replays/mo. More than enough for P0. No risk here
3. **10s serverless timeout:** Follow-up cron processes max 5 orders per run to stay within limits. At P0 volumes this is fine
4. **OG image:** Needs to be created as a design task — not a code blocker, but social sharing won't look great without it
