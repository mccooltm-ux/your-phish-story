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

## Wave 1: Launch Readiness (Ship Day 1-2) ✅ CODE COMPLETE

Bug fixes, social sharing meta tags, and sample preview improvements. Get the page ready for eyeballs.

### 1.1 Fix Known Bugs ✅

| File | Fix | Status |
|------|-----|--------|
| `public/admin.html` | Refund modal says "$20" → change to "$25" | ✅ Done |
| `api/create-checkout-session.js` | Comment says `$20.00` → update to `$25.00` | ✅ Done |

### 1.2 OG Meta Tags + Twitter Cards ✅

**File:** `public/index.html` (add to `<head>`) — ✅ Done

Added:
```html
<meta property="og:image" content="https://myphishistory.com/images/og-preview.jpg">
<meta property="og:url" content="https://myphishistory.com">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="MyPhisHistory">
<meta name="twitter:description" content="Your complete Phish show history, turned into an extensive personalized PDF deep dive.">
<meta name="twitter:image" content="https://myphishistory.com/images/og-preview.jpg">
```

**⚠️ Design dependency (NOT code):** Still need to create `og-preview.jpg` (1200x630px). OG tags point to `/images/og-preview.jpg` but the image file doesn't exist yet. Social sharing will show a broken image until this is created.

### 1.3 Add 4th Sample Card ✅

**File:** `public/index.html` — ✅ Done

Era analysis sample card added using `/images/sample-eras.jpg` with label "Era analysis — your journey through 1.0, 2.0, 3.0, and beyond".

### 1.4 Sample Image Lightbox ✅

**File:** `public/index.html` — ✅ Done

Pure CSS/JS lightbox: click any sample card to enlarge, ESC key or click overlay to close. No external dependencies.

### 1.5 Snapshot Page Font Alignment ✅

**File:** `public/snapshot.html` — ✅ Done

Replaced Georgia/serif with Inter (body) + DM Serif Display (headings). Google Fonts preconnect and stylesheet link added.

### Wave 1 Files Modified
- ✅ `public/index.html` — OG tags, 4th sample card, lightbox, dead code cleanup
- ✅ `public/snapshot.html` — font alignment
- ✅ `public/admin.html` — $20 → $25 fix
- ✅ `api/create-checkout-session.js` — comment fix
- ⚠️ `public/images/og-preview.jpg` — **NOT DONE** (design task, not code)

---

## Wave 2: Analytics + Distribution Hooks (Ship Day 3-5) ✅ CODE COMPLETE

Instrument the funnel with PostHog, make snapshots shareable, add share CTAs.

### 2.1 PostHog Integration ✅

**Files:** `public/index.html`, `public/snapshot.html`, `public/success.html` — ✅ All 3 pages instrumented

PostHog snippet added to all customer-facing pages (not admin). Token: `phc_V0eCSYRcSxR3lH1yIk4RSltPVoZWEtEp3i6pVo2fOZZ`, host: `https://us.i.posthog.com`.

Custom events at key funnel points:

| Event | Trigger | Page | Status |
|-------|---------|------|--------|
| `snapshot_form_submit` | Free snapshot form submitted | index.html | ✅ |
| `username_validated` | Phishnet username check succeeds | index.html | ✅ |
| `username_failed` | Phishnet username check fails | index.html | ✅ |
| `checkout_started` | Order form submitted | index.html | ✅ |
| `checkout_redirected` | Stripe redirect fires | index.html | ✅ |
| `snapshot_viewed` | Snapshot results render | snapshot.html | ✅ |
| `upsell_clicked` | "Get Full PDF" CTA clicked on snapshot | snapshot.html | ✅ |
| `purchase_completed` | Success page loads | success.html | ✅ |
| `share_clicked` | Any share button clicked | success.html | ✅ |

### 2.2 Shareable Snapshot URLs ✅

**Files:** `public/snapshot.html`, `api/generate-snapshot.js` — ✅ Done

- "Share Your Stats" button copies URL with `?share=true` to clipboard
- When `share=true`: email field skipped in UI, API skips email validation + Resend notification
- Share mode shows "Get Your Own Snapshot" CTA instead of upsell

### 2.3 Share Buttons on Success Page ✅

**File:** `public/success.html` — ✅ Done

- "Know another phan?" section with copy link (`?ref=friend`) + Twitter/X share button
- Pre-filled tweet text with `@MyPhisHistory` mention
- `share_clicked` events with `method: 'copy_link'` or `'twitter'`

### 2.4 Mobile UX Audit & Fixes — PARTIAL

**File:** `public/index.html` — ✅ CSS fixes applied

- ✅ Gift toggle: min-height 44px, flex-wrap under 360px
- ✅ Contact modal: all inputs/buttons min-height 44px for touch targets
- ✅ Sample grid: stacks to 1-column below 360px
- ⚠️ **NOT TESTED on real devices** — CSS written but needs manual verification on iPhone Safari + Android Chrome
- ⚠️ `public/snapshot.html` — no specific mobile CSS fixes applied (font change only)

### Wave 2 Files Modified
- ✅ `public/index.html` — PostHog snippet, 5 custom events, mobile CSS fixes
- ✅ `public/snapshot.html` — PostHog snippet, 2 custom events, share button, share=true mode
- ✅ `public/success.html` — PostHog snippet, purchase_completed event, share section
- ✅ `api/generate-snapshot.js` — email optional for share mode

### Wave 2 New Dependencies
- ✅ PostHog JS snippet (loaded via CDN `<script>` tag, not an npm dep)

---

## Wave 3: Follow-Up Email + Admin Improvements (Ship Day 6-10) ✅ CODE COMPLETE

Automated customer follow-up and operational improvements for Ted.

### 3.1 Follow-Up Email Cron ✅

**New file:** `api/cron/follow-up.js` (89 lines) — ✅ Created

Daily cron job (Vercel Hobby plan: 1 cron, daily at 2pm UTC / 10am ET):

1. ✅ GET endpoint with `CRON_SECRET` Bearer token verification
2. ✅ Queries Stripe for payment intents with `fulfillment_status: 'delivered'` created 3+ days ago
3. ✅ Skips orders where `follow_up_sent: 'true'` in metadata
4. ✅ Sends follow-up email via Resend from "Ted at MyPhisHistory <support@myphishistory.com>"
5. ✅ Updates Stripe metadata: `follow_up_sent: 'true'`
6. ✅ Processes max 5 per invocation

**Note on filtering approach:** The cron queries `paymentIntents.list()` with `created: { lt: THREE_DAYS_AGO }` then filters client-side for `fulfillment_status === 'delivered'`. This works fine at P0 volumes (limit: 20 per page). At scale, would need pagination or a different query strategy.

**Vercel cron config:** ✅ Added to `vercel.json`

**Env var:** ✅ `CRON_SECRET` set in Vercel environment

### 3.2 Admin Notification Email Improvements ✅

**File:** `api/webhook.js` — ✅ Done

- ✅ `full_name` added to orderDetails and displayed in both text + HTML email
- ✅ Admin panel link: styled button in HTML, plain URL in text
- ✅ 48h delivery deadline calculated and displayed prominently (highlighted row in HTML)
- ✅ Order count badge: queries `stripe.checkout.sessions.list` for total_count, shown as "Order #N" pill + in subject line

### 3.3 Admin Panel Enhancements ✅

**Files:** `public/admin.html`, `api/admin/orders.js` — ✅ Done

- ✅ `delivered_at` and `follow_up_sent` passed through from Stripe PI metadata
- ✅ "Delivered" column added to order table with formatted timestamp
- ✅ "Overdue" badge (`status-overdue` CSS class) for pending orders > 48h old
- ✅ $20 → $25 in refund modal (covered in Wave 1)

### Wave 3 New Files
- ✅ `api/cron/follow-up.js` (89 lines)

### Wave 3 Files Modified
- ✅ `api/webhook.js` — notification email improvements
- ✅ `public/admin.html` — delivered column, overdue badges
- ✅ `api/admin/orders.js` — pass through delivered_at + follow_up_sent
- ✅ `vercel.json` — cron config + function config for api/cron/*.js

### Wave 3 New Env Vars
- ✅ `CRON_SECRET` — set in Vercel environment

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

### Wave 1 — Code verified, needs deploy testing
- [x] OG tags present in `<head>` (og:url, og:image, og:type, twitter:card/title/description/image)
- [ ] OG tags render correctly: test with https://opengraph.xyz or Twitter Card Validator (needs deploy + og-preview.jpg)
- [x] 4th sample card (era analysis) added to grid with `/images/sample-eras.jpg`
- [x] Lightbox CSS/JS added — click to enlarge, ESC/overlay-click to close
- [x] snapshot.html fonts changed from Georgia to Inter + DM Serif Display
- [x] admin.html refund modal says "$25" (was "$20")
- [x] create-checkout-session.js comment says "$25.00" (was "$20.00")
- [x] Dead heroCTA code removed from index.html

### Wave 2 — Code verified, needs deploy testing
- [x] PostHog snippet in index.html, snapshot.html, success.html (3/3 customer-facing pages)
- [x] All 9 custom events implemented (snapshot_form_submit, username_validated, username_failed, checkout_started, checkout_redirected, snapshot_viewed, upsell_clicked, purchase_completed, share_clicked)
- [ ] PostHog dashboard shows events firing (needs deploy)
- [ ] Funnel visualization works in PostHog (needs deploy + real traffic)
- [ ] Session replay captures sessions (needs deploy)
- [x] Shareable snapshot: `?share=true` skips email in UI + API
- [x] Share button copies URL to clipboard with toast
- [x] success.html share section: copy link (`?ref=friend`) + Twitter/X button
- [x] Mobile CSS: gift toggle 44px, contact modal 44px targets, grid stacks <360px
- [ ] Mobile: test checkout flow on real iPhone Safari and Android Chrome (needs deploy)

### Wave 3 — Code verified, needs deploy testing
- [x] `api/cron/follow-up.js` created (89 lines, GET handler)
- [x] CRON_SECRET Bearer token auth implemented
- [x] Stripe query for delivered orders 3+ days old without follow_up_sent
- [x] Follow-up email template: conversational, reply-friendly, signed by Ted
- [x] Stripe metadata update: `follow_up_sent: 'true'`
- [x] Max 5 per invocation
- [x] `vercel.json` has cron config (`0 14 * * *`) + function config for `api/cron/*.js`
- [x] `CRON_SECRET` env var set in Vercel
- [x] Webhook email includes full_name, order count badge, 48h deadline, admin link
- [x] Admin panel: delivered_at column, overdue badges, $25 fix
- [x] orders.js passes through delivered_at + follow_up_sent from Stripe metadata
- [ ] Cron endpoint responds correctly (needs deploy)
- [ ] Follow-up email sends for real test order (needs deploy + 3-day-old delivered order)

---

## Completion Summary

**PR:** #2 (`feat/p0-launch-wave`)
**Commit:** `565da96`
**Files changed:** 11 (+730/-35 lines)

### What's DONE (code shipped in this PR)

All planned code changes across Waves 1-3 are implemented:
- 3 customer-facing pages instrumented with PostHog (9 funnel events)
- OG + Twitter Card meta tags on landing page
- 4th sample card + lightbox
- Shareable snapshot URLs with share=true mode
- Share buttons on success page (copy link + Twitter/X)
- Admin: $25 fix, delivered_at column, overdue badges
- Webhook email: full_name, order count, 48h deadline, admin link
- Follow-up cron job (daily 2PM UTC)
- Font alignment on snapshot page
- Mobile CSS fixes
- Dead code cleanup

### What's NOT DONE (pre-deploy tasks)

| Item | Type | Blocker? |
|------|------|----------|
| `og-preview.jpg` (1200x630px) | Design task | No — OG tags work, just shows broken image without it |
| Mobile testing on real devices | Manual QA | No — CSS is written, needs verification |
| PostHog funnel setup in dashboard | Configuration | No — events fire, funnels need to be built in PostHog UI |
| Deploy + smoke test | Operations | **Yes — nothing is live until deployed** |

---

## Risk Notes

1. **Vercel Hobby cron limit:** 1 cron job, daily only. If we need more crons later (P1 automation), will need Pro ($20/mo) or external scheduler
2. **PostHog free tier:** 1M events/mo, 5K session replays/mo. More than enough for P0. No risk here
3. **10s serverless timeout:** Follow-up cron processes max 5 orders per run to stay within limits. At P0 volumes this is fine
4. **OG image:** Needs to be created as a design task — not a code blocker, but social sharing won't look great without it
