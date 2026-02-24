const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const ORDER_CAP = parseInt(process.env.ORDER_CAP || '20', 10);

module.exports = async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { phishnet_username, email, is_gift, gift_email, full_name } = req.body;

    // Validate required fields
    if (!phishnet_username || !email) {
      return res.status(400).json({ error: 'Phishnet username and email are required.' });
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
      phishnet_username: phishnet_username,
      customer_email: email,
      is_gift: is_gift ? 'true' : 'false',
    };

    if (full_name) {
      metadata.full_name = full_name;
    }

    if (is_gift && gift_email) {
      metadata.gift_recipient_email = gift_email;
    }

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: email,
      metadata: metadata,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'MyPhisHistory - Personalized PDF',
              description: `Personalized show history document for Phishnet user: ${phishnet_username}`,
            },
            unit_amount: 2500, // $25.00 in cents
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.DOMAIN || 'https://myphishistory.com'}/success.html`,
      cancel_url: `${process.env.DOMAIN || 'https://myphishistory.com'}/#order`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err.message);
    return res.status(500).json({ error: 'Failed to create checkout session. Please try again.' });
  }
};
