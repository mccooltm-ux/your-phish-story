const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Using Resend for email â simplest API, free tier = 100 emails/day
// Sign up at resend.com, get API key, set as RESEND_API_KEY env var
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL || 'mccooltm@gmail.com';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    // Verify webhook signature
    // Note: Vercel provides raw body automatically for API routes
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  // Handle the checkout.session.completed event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const metadata = session.metadata || {};

    const orderDetails = {
      phishnet_username: metadata.phishnet_username || 'UNKNOWN',
      customer_email: metadata.customer_email || session.customer_email || 'UNKNOWN',
      is_gift: metadata.is_gift === 'true',
      gift_recipient_email: metadata.gift_recipient_email || null,
      amount_paid: `$${(session.amount_total / 100).toFixed(2)}`,
      payment_id: session.payment_intent,
      created: new Date(session.created * 1000).toLocaleString('en-US', {
        timeZone: 'America/New_York',
        dateStyle: 'full',
        timeStyle: 'short'
      }),
    };

    // Send notification email to Ted
    try {
      await sendNotificationEmail(orderDetails);
      console.log('Order notification sent:', orderDetails.phishnet_username);
    } catch (emailErr) {
      console.error('Failed to send notification email:', emailErr.message);
      // Don't fail the webhook â Stripe will retry, and we don't want duplicate charges
    }
  }

  // Always return 200 to acknowledge receipt
  return res.status(200).json({ received: true });
};

async function sendNotificationEmail(order) {
  const giftLine = order.is_gift
    ? `\nð GIFT ORDER â Deliver to: ${order.gift_recipient_email}`
    : '';

  const subject = `New MyPhisHistory Order: ${order.phishnet_username}`;
  const body = `
New order received!

Phishnet Username: ${order.phishnet_username}
Customer Email: ${order.customer_email}${giftLine}
Amount: ${order.amount_paid}
Payment ID: ${order.payment_id}
Date: ${order.created}

Phishnet profile: https://phish.net/user/${order.phishnet_username}
Show history API: https://api.phish.net/v5/shows/username/${order.phishnet_username}.json

Action needed: Generate the PDF and email it to ${order.is_gift ? order.gift_recipient_email : order.customer_email}
`.trim();

  const htmlBody = `
<div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #e8723a; margin-bottom: 4px;">New MyPhisHistory Order</h2>
  <p style="color: #666; font-size: 14px; margin-top: 0;">${order.created}</p>

  <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
    <tr style="border-bottom: 1px solid #eee;">
      <td style="padding: 10px 0; color: #888; font-size: 14px;">Phishnet Username</td>
      <td style="padding: 10px 0; font-weight: 600; font-size: 14px;"><a href="https://phish.net/user/${order.phishnet_username}">${order.phishnet_username}</a></td>
    </tr>
    <tr style="border-bottom: 1px solid #eee;">
      <td style="padding: 10px 0; color: #888; font-size: 14px;">Customer Email</td>
      <td style="padding: 10px 0; font-size: 14px;">${order.customer_email}</td>
    </tr>
    ${order.is_gift ? `
    <tr style="border-bottom: 1px solid #eee; background: #fff8f0;">
      <td style="padding: 10px 0; color: #e8723a; font-size: 14px;">ð Gift â Deliver To</td>
      <td style="padding: 10px 0; font-weight: 600; font-size: 14px;">${order.gift_recipient_email}</td>
    </tr>` : ''}
    <tr style="border-bottom: 1px solid #eee;">
      <td style="padding: 10px 0; color: #888; font-size: 14px;">Amount</td>
      <td style="padding: 10px 0; font-size: 14px;">${order.amount_paid}</td>
    </tr>
    <tr>
      <td style="padding: 10px 0; color: #888; font-size: 14px;">Payment ID</td>
      <td style="padding: 10px 0; font-size: 13px; font-family: monospace;">${order.payment_id}</td>
    </tr>
  </table>

  <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 20px 0;">
    <strong style="font-size: 14px;">Quick links:</strong><br>
    <a href="https://api.phish.net/v5/shows/username/${order.phishnet_username}.json" style="font-size: 13px;">Show History JSON</a> Â·
    <a href="https://phish.net/user/${order.phishnet_username}" style="font-size: 13px;">Phishnet Profile</a>
  </div>

  <p style="color: #888; font-size: 13px;">
    <strong>Action:</strong> Generate the PDF and email to <strong>${order.is_gift ? order.gift_recipient_email : order.customer_email}</strong>
  </p>
</div>`.trim();

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: 'MyPhisHistory <onboarding@resend.dev>',
      to: [NOTIFICATION_EMAIL],
      subject: subject,
      text: body,
      html: htmlBody,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Resend API error: ${response.status} â ${errText}`);
  }
}

// Vercel config: disable body parsing so we get the raw body for Stripe signature verification
module.exports.config = {
  api: {
    bodyParser: false,
  },
};

// Helper to get raw body for Stripe signature verification
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
