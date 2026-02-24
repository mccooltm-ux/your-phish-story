# E2E Test Plan — Pre-Launch Sandbox Verification

> Run all tests against the live Vercel deployment with **Stripe test mode** enabled.

---

## Prerequisites

- Stripe test mode keys configured in Vercel env vars
- PostHog project live and accepting events
- Resend API key configured (test emails will send to NOTIFICATION_EMAIL)
- A valid Phishnet username with shows (e.g., `mccool11`)
- A Phishnet username with zero shows (e.g., `zzzznotauser`)

---

## Flow 1: Free Snapshot (Happy Path)

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Load myphishistory.com | Landing page renders, hero + samples + snapshot form visible |
| 2 | Scroll to snapshot section | Form shows username field only (no email field) |
| 3 | Type valid Phishnet username | After ~600ms debounce, status shows "Found X shows" in green |
| 4 | Click "Get My Free Snapshot" | Redirects to /snapshot.html?username=... |
| 5 | Snapshot page loads | Shows stats: total shows, years, venues, est. songs, bookends, top venues, year chart |
| 6 | Click "Share Your Stats" | URL copied to clipboard with ?share=true, toast appears |
| 7 | Open shared URL in incognito | Snapshot loads without email, shows "Get Your Own Snapshot" CTA instead of upsell |

### PostHog verification:
- `snapshot_form_submit` event fired (step 4)
- `snapshot_viewed` event fired (step 5)

---

## Flow 2: Free Snapshot (Error Cases)

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Type invalid username (e.g., `zzzznotauser`) | Status shows "No shows found..." in red |
| 2 | Click submit with invalid username | Error: "Please wait for username validation to complete." |
| 3 | Submit with empty username | Error: "Please enter your Phishnet username." |

### PostHog verification:
- `username_failed` event NOT fired (that's on the order form only)

---

## Flow 3: Purchase (Happy Path)

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Scroll to order section | Form shows: username, name, email, gift checkbox |
| 2 | Enter valid Phishnet username | Status shows "Found X shows" in green after debounce |
| 3 | Fill in name and email | Fields accept input |
| 4 | Click "Get MyPhisHistory — $25" | Button shows "Redirecting to payment...", then redirects to Stripe Checkout |
| 5 | Complete payment with test card `4242 4242 4242 4242` | Stripe processes, redirects to /success.html |
| 6 | Success page loads | Shows confirmation, "What happens next" steps, share section |
| 7 | Click "Copy Link" on success page | Clipboard gets myphishistory.com/?ref=friend, toast shows |
| 8 | Click "Share on X" | Opens Twitter intent in new tab with pre-filled text |

### PostHog verification:
- `username_validated` event (step 2)
- `checkout_started` event (step 4)
- `checkout_redirected` event (step 4)
- `purchase_completed` event (step 6)
- `posthog.identify(email)` called (step 4) — check PostHog persons list

### Email verification:
- Admin notification email received at NOTIFICATION_EMAIL with order details, deadline, admin link

---

## Flow 4: Purchase — Gift Mode

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Check "This is a gift" checkbox | Gift recipient email field appears |
| 2 | Fill in recipient email | Field accepts input |
| 3 | Complete checkout | Stripe metadata includes `is_gift: true` and `gift_recipient_email` |

---

## Flow 5: Waitlist (When Order Cap Reached)

> To test: temporarily set `ORDER_CAP=0` in Vercel env vars, then restore after testing.

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Submit order form | Instead of Stripe redirect, waitlist UI appears |
| 2 | Waitlist UI shows | "Join the Waitlist" heading, email pre-filled, name field, submit button |
| 3 | Submit waitlist form | Success message: "You're on the list!" |
| 4 | Submit same email again | Returns "already on the waitlist" message (dedup works) |

### Stripe verification:
- New customer created with metadata: `waitlist: true`, `phishnet_username`, `joined_at`
- Duplicate submission does NOT create a second customer

### Email verification:
- Admin gets "New Waitlist Signup" notification
- Customer gets "You're on the waitlist" confirmation

### PostHog verification:
- `waitlist_shown` event (step 1)
- `waitlist_joined` event (step 3)

---

## Flow 6: Admin Panel

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Load /admin.html | Login prompt (enter admin secret) |
| 2 | Enter correct ADMIN_SECRET | Dashboard loads: Orders tab active, stats in header |
| 3 | Verify order from Flow 3 | Order appears in table with username, email, status, amount |
| 4 | Click "Waitlist" tab | Waitlist table loads with entries from Flow 5 |
| 5 | Verify waitlist count badge | Shows correct count next to "Waitlist" tab |

---

## Flow 7: Referral Tracking

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Open myphishistory.com/?ref=friend | Page loads normally |
| 2 | Check PostHog | `referral_landing` event fired with `ref_source: friend` |
| 3 | Navigate the site normally | All subsequent events have `ref_source` super property attached |

---

## Flow 8: Mobile Viewport Check

Test at 375px (iPhone SE) and 390px (iPhone 14) widths:

| # | Check | Expected |
|---|-------|----------|
| 1 | Hero section | Text readable, badge fits, no horizontal overflow |
| 2 | Sample cards | Stack to single column, images not cut off |
| 3 | Snapshot form | Full width, button tappable (44px+ height) |
| 4 | Order form | All fields full width, gift toggle tappable |
| 5 | Contact modal | Inputs 44px+ touch targets, modal fills screen |

---

## Flow 9: OG / Social Sharing Preview

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Test myphishistory.com on opengraph.xyz | Preview shows og-preview.jpg, correct title/description |
| 2 | Paste URL in Twitter compose | Card preview shows image + title + description |
| 3 | Paste URL in iMessage/Slack | Link unfurl shows OG image |

---

## Smoke Test Checklist (Quick Pass)

Run this as a rapid sanity check before any deploy:

- [ ] Landing page loads (no console errors)
- [ ] Free snapshot works with valid username
- [ ] Order form validates username
- [ ] Stripe checkout redirects (test mode)
- [ ] Success page loads after payment
- [ ] Admin panel loads and shows orders
- [ ] Contact form submits
- [ ] No `mccooltm@gmail.com` visible on any customer-facing page
