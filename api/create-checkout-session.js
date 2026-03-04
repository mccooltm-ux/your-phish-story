const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const ORDER_CAP = parseInt(process.env.ORDER_CAP || '20', 10);
const DOMAIN = process.env.DOMAIN || 'https://myphishistory.com';
const LAUNCH_FREE_MODE = process.env.LAUNCH_FREE_MODE === 'true';
const PAID_AMOUNT_CENTS = 2500;

function isValidEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function normalizeUsername(value) {
  const username = typeof value === 'string' ? value.trim() : '';
  if (!/^[A-Za-z0-9._-]{2,40}$/.test(username)) {
    return '';
  }
  return username;
}

module.exports = async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { phishnet_username, email, is_gift, gift_email, full_name } = req.body || {};
    const username = normalizeUsername(phishnet_username);
    const normalizedEmail = typeof email === 'string' ? email.trim() : '';
    const normalizedGiftEmail = typeof gift_email === 'string' ? gift_email.trim() : '';
    const normalizedFullName = typeof full_name === 'string' ? full_name.trim() : '';
    const giftOrder = Boolean(is_gift);

    // Validate required fields
    if (!username) {
      return res.status(400).json({ error: 'Enter a valid Phishnet username.' });
    }

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }

    if (giftOrder && !isValidEmail(normalizedGiftEmail)) {
      return res.status(400).json({ error: 'Enter a valid recipient email for gift delivery.' });
    }

    // Check order cap — count completed Stripe checkout sessions
    const completedSessions = await stripe.checkout.sessions.list({ limit: 1, status: 'complete' });
    const orderCount = completedSessions.total_count || 0;

    if (orderCount >= ORDER_CAP) {
      return res.status(200).json({
        waitlist: true,
        message: `We're at capacity for this wave. Join the waitlist and we'll email you when we open up.`
      });
    }

    // Build metadata for the order (this is what the webhook reads)
    const metadata = {
      phishnet_username: username,
      customer_email: normalizedEmail,
      is_gift: giftOrder ? 'true' : 'false',
      launch_free_mode: LAUNCH_FREE_MODE ? 'true' : 'false'
    };

    if (normalizedFullName) {
      metadata.full_name = normalizedFullName;
    }

    if (giftOrder) {
      metadata.gift_recipient_email = normalizedGiftEmail;
    }

    const amountCents = LAUNCH_FREE_MODE ? 0 : PAID_AMOUNT_CENTS;

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: normalizedEmail,
      metadata,
      payment_intent_data: {
        metadata
      },
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'MyPhisHistory - Personalized PDF',
              description: `AI-assisted personalized show history document for Phishnet user: ${username}`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      success_url: `${DOMAIN}/success.html`,
      cancel_url: `${DOMAIN}/#order`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err.message);
    return res.status(500).json({ error: 'Failed to create checkout session. Please try again.' });
  }
};
