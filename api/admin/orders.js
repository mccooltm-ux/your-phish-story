// /api/admin/orders.js — List all orders from Stripe
// Uses Stripe as the database — no separate DB needed

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';
const DISPLAY_TIMEZONE = process.env.DISPLAY_TIMEZONE || 'America/Chicago';

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!ADMIN_SECRET) {
    return res.status(500).json({ error: 'Server misconfigured: ADMIN_SECRET is not set' });
  }

  // Auth check
  const secret = req.headers['x-admin-secret'];
  if (secret !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Fetch completed checkout sessions from Stripe (last 100)
    // Expand payment_intent AND its latest_charge so we can check refund status
    const sessions = await stripe.checkout.sessions.list({
      limit: 100,
      status: 'complete',
      expand: ['data.payment_intent.latest_charge']
    });

    const orders = sessions.data.map(session => {
      const meta = session.metadata || {};
      const pi = session.payment_intent;
      const piMeta = (pi && pi.metadata) || {};
      const mergedMeta = {
        ...piMeta,
        ...meta
      };
      const charge = (pi && pi.latest_charge && typeof pi.latest_charge === 'object') ? pi.latest_charge : null;

      // Determine fulfillment status:
      // 1. If Stripe shows the charge was refunded (via any method), mark as refunded
      // 2. Otherwise use our custom metadata
      // 3. Default to 'pending'
      let fulfillmentStatus = piMeta.fulfillment_status || 'pending';
      if (charge && charge.refunded) {
        fulfillmentStatus = 'refunded';
      } else if (charge && charge.amount_refunded > 0) {
        fulfillmentStatus = 'refunded';
      }

      return {
        session_id: session.id,
        payment_id: pi ? pi.id : null,
        username: mergedMeta.phishnet_username || 'UNKNOWN',
        email: mergedMeta.customer_email || session.customer_email || '',
        is_gift: mergedMeta.is_gift === 'true',
        gift_email: mergedMeta.gift_recipient_email || null,
        full_name: mergedMeta.full_name || null,
        amount: (session.amount_total || 0) / 100,
        status: fulfillmentStatus,
        delivered_at: piMeta.delivered_at || null,
        follow_up_sent: piMeta.follow_up_sent || null,
        date: new Date(session.created * 1000).toLocaleDateString('en-US', {
          timeZone: DISPLAY_TIMEZONE,
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        }),
        created: session.created
      };
    });

    // Sort newest first
    orders.sort((a, b) => b.created - a.created);

    return res.status(200).json({ orders, count: orders.length });
  } catch (err) {
    console.error('Failed to fetch orders:', err.message);
    return res.status(500).json({ error: 'Failed to fetch orders', details: err.message });
  }
};
