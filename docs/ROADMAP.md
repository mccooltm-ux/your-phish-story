# MyPhisHistory Product Roadmap

> Last updated: 2026-02-24

## Priority Levels

| Priority | Meaning | Gate |
|----------|---------|------|
| **P0** | Must-have for launch | Before first real order |
| **P1** | Do after validating demand | After ~20-50 orders + customer feedback |
| **P2** | Growth & expansion | After automation is live and product-market fit is confirmed |

---

## P0 — Launch & Validate Demand ✅ COMPLETE

**Objective:** Prove people will pay for this. Get to first 20 orders and learn what customers love.

### Funnel & Analytics ✅

- [x] PostHog integration across all customer-facing pages (index, snapshot, success)
- [x] 10+ custom funnel events (snapshot_form_submit, username_validated, checkout_started, purchase_completed, etc.)
- [x] `posthog.identify()` for user stitching (email-based on checkout, username-based on snapshot)
- [x] Referral attribution via `?ref=` URL parameter tracking
- [x] Funnel setup guide documented (docs/POSTHOG-FUNNEL-SETUP.md)

### Landing Page Launch Readiness ✅

- [x] Copy audit — tightened messaging, aligned sample descriptions with actual content
- [x] OG preview image (1200x630px) for social sharing
- [x] OG + Twitter Card meta tags
- [x] 3 sample PDF preview cards with lightbox (show history, songs, stats)
- [x] Mobile UX audit — touch targets, responsive grid, viewport testing at 375px/390px
- [x] Free snapshot form with debounced username validation + show count display
- [x] "What's in the PDF" feature grid below snapshot form

### Order Cap + Waitlist ✅

- [x] Order cap (configurable via `ORDER_CAP` env var, default 20)
- [x] Waitlist overflow — users added as Stripe customers with metadata
- [x] Waitlist join endpoint with dedup, admin + customer confirmation emails
- [x] Admin panel: Waitlist tab with count badge, table view, FIFO ordering
- [x] "Limited first wave" framing on hero badge

### Distribution ✅

- [x] Distribution copy kit ready (Reddit, Twitter/X, Phantasy Tour, DM templates)
- [x] Share buttons on success page (copy link + Twitter/X)
- [x] Shareable snapshot URLs (`?share=true` mode)

### Post-Purchase ✅

- [x] Follow-up email cron (3 days after delivery, via Resend)
- [x] Admin notification emails with order count, 48h deadline, full_name
- [x] Admin panel: delivered status, overdue badges

### Manual Operations

- [ ] Keep the human-generated PDF workflow for now — it's a feature, not a bug
- [ ] Use every manual order as a learning loop: what takes time, what gets positive reactions, what gets skipped
- [ ] Document the "ideal PDF" template based on first 10 orders

---

## P1 — Optimize Product & Automate Generation

**Objective:** Refine the PDF based on real feedback. Remove the manual bottleneck. Enable same-day delivery.

**Gate:** Enter P1 after ~20-50 orders and clear signal on what customers value most.

### Product Refinement

- [ ] Cut or rework PDF sections that customers don't mention or rate low
- [ ] Double down on the sections customers highlight (the "I cried reading the letter" moments)
- [ ] Curate artistic assets — custom illustrations, typography, branded page layouts
- [ ] Design 1-2 pages specifically for social sharing (shareable stats card, "My Phish Identity" badge)

### PDF Automation (Friend's POC)

- [ ] Integrate automated PDF generation into the pipeline
- [ ] Webhook triggers generation → PDF built → delivered automatically (or queued for review)
- [ ] Quality gate: side-by-side comparison of automated vs. hand-crafted PDFs for first 10 automated orders
- [ ] Human touch shifts from "writing each PDF" to "curating templates, assets, and prompt engineering"
- [ ] Delivery time target: 48 hours → under 1 hour

### Pricing Experiments

- [ ] A/B test price points: $20 / $25 / $30 — Phish fans spend freely on things they love
- [ ] Test a "Deluxe" tier placeholder on the landing page to gauge willingness to pay more
- [ ] Analyze price sensitivity vs. conversion rate

### Gift Flow Optimization

- [ ] This product is a natural gift — push gift purchases in copy and UX
- [ ] Pre-tour and holiday gift marketing (email past customers before Phish tour announcements)
- [ ] Gift wrapping UX: custom message, scheduled delivery date, printable gift certificate

---

## P2 — Expand Revenue Streams & Growth Loops

**Objective:** Stack new revenue on top of the core product. Expand beyond Phish.

**Gate:** Enter P2 after automation is live, product-market fit is confirmed, and the core funnel is profitable.

### New Product Tiers

| Product | Target Price | Description |
|---------|-------------|-------------|
| **Standard PDF** | $20-30 | Core product (current) |
| **Deluxe Edition** | $45-60 | Printed physical copy, premium paper, mailed to your door |
| **Tour Update** | $10-15 | "Refresh your history after Summer 2026 tour" — recurring revenue |
| **Gift Bundle** | $35 | PDF + printable certificate + custom personal message |

### Recurring Revenue: Tour Updates

- [ ] After each Phish tour, email past customers: "You just saw 5 more shows — update your history for $10"
- [ ] Low effort (incremental generation), high margin, built-in audience
- [ ] Consider a subscription: $30/year for automatic updates after every tour

### Expand to Other Bands

- [ ] Same engine, new data sources — target bands with dedicated fan communities and public setlist data
- [ ] Priority candidates: Dead & Company, Goose, Widespread Panic, Billy Strings, Umphrey's McGee
- [ ] Rebrand umbrella: "MyShowHistory" or similar, with MyPhisHistory as the flagship
- [ ] Research data availability: setlist.fm API, other band-specific databases

### Growth Loops

- [ ] **Referral program:** "Share with a friend, get $5 off your next Tour Update"
- [ ] **Tour-timed marketing:** Phish announces dates → nostalgia peaks → ads and emails hit
- [ ] **Social proof flywheel:** Encourage customers to share their shareable PDF pages on social → drives organic traffic
- [ ] **Phish.net partnership:** Explore integration — link from user profiles, co-marketing, affiliate deal
- [ ] **Lot presence:** QR code flyers, festival booths, word of mouth at shows

### Operational Scale

- [ ] Move from Stripe-as-database to a real data layer if order volume warrants it
- [ ] Customer accounts / order history portal ("View your past MyPhisHistory editions")
- [ ] Automated re-engagement emails (new tour announced, anniversary of first show, etc.)

---

## Success Metrics by Phase

| Phase | Key Metric | Target |
|-------|-----------|--------|
| **P0** | First paid orders | 20 orders |
| **P0** | Landing page conversion rate | > 3% |
| **P0** | Customer satisfaction | > 4/5 avg rating |
| **P1** | Automated PDF quality | Matches hand-crafted quality |
| **P1** | Delivery time | < 1 hour |
| **P1** | Monthly revenue | $500+/mo |
| **P2** | Revenue streams | 3+ active product lines |
| **P2** | Monthly revenue | $2,000+/mo |
| **P2** | Band expansion | 2+ bands live |
