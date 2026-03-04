// /api/admin/fulfill.js — Mark order as delivered or issue refund
// Updates payment intent metadata for tracking, uses Stripe refund API

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
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

  const { payment_id, action } = req.body || {};

  if (!payment_id || !action) {
    return res.status(400).json({ error: 'Missing payment_id or action' });
  }

  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(payment_id);
    const existingMetadata = paymentIntent.metadata || {};

    if (action === 'delivered') {
      // Update payment intent metadata to mark as delivered
      await stripe.paymentIntents.update(payment_id, {
        metadata: {
          ...existingMetadata,
          fulfillment_status: 'delivered',
          delivered_at: new Date().toISOString()
        }
      });
      return res.status(200).json({ success: true, status: 'delivered' });

    } else if (action === 'refund') {
      // Issue full refund via Stripe
      const refund = await stripe.refunds.create({
        payment_intent: payment_id
      });

      // Update metadata
      await stripe.paymentIntents.update(payment_id, {
        metadata: {
          ...existingMetadata,
          fulfillment_status: 'refunded',
          refunded_at: new Date().toISOString(),
          refund_id: refund.id
        }
      });

      return res.status(200).json({
        success: true,
        status: 'refunded',
        refund_id: refund.id,
        amount: refund.amount / 100
      });

    } else {
      return res.status(400).json({ error: 'Invalid action. Use "delivered" or "refund"' });
    }
  } catch (err) {
    console.error('Fulfill action failed:', err.message);
    return res.status(500).json({ error: 'Action failed', details: err.message });
  }
};
