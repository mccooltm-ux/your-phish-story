const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const RESEND_API_KEY = process.env.RESEND_API_KEY;

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify cron secret
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const THREE_DAYS_AGO = Math.floor((Date.now() - 3 * 24 * 60 * 60 * 1000) / 1000);
  let sent = 0;

  try {
    // Find delivered orders that haven't received a follow-up yet
    const paymentIntents = await stripe.paymentIntents.list({
      limit: 20,
      created: { lt: THREE_DAYS_AGO },
    });

    for (const pi of paymentIntents.data) {
      if (sent >= 5) break;

      const meta = pi.metadata || {};
      if (meta.fulfillment_status !== 'delivered') continue;
      if (meta.follow_up_sent === 'true') continue;

      const username = meta.phishnet_username || 'friend';
      const fullName = meta.full_name || username;
      const email = meta.customer_email || pi.receipt_email;
      if (!email) continue;

      // Send follow-up email
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: 'Ted at MyPhisHistory <support@myphishistory.com>',
          to: email,
          subject: `How'd we do, ${username}?`,
          text: `Hey ${fullName},

Just wanted to check in — hopefully your MyPhisHistory PDF brought back some great memories.

Did we nail it? Miss anything? I'd genuinely love to hear what you think. Just hit reply — I read every response.

Thanks for being part of this,
Ted

P.S. If you know another phan who'd love their own story, send them to myphishistory.com`,
          html: `
<div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p style="font-size: 15px; line-height: 1.6;">Hey ${fullName},</p>
  <p style="font-size: 15px; line-height: 1.6;">Just wanted to check in — hopefully your MyPhisHistory PDF brought back some great memories.</p>
  <p style="font-size: 15px; line-height: 1.6;">Did we nail it? Miss anything? I'd genuinely love to hear what you think. Just hit reply — I read every response.</p>
  <p style="font-size: 15px; line-height: 1.6;">Thanks for being part of this,<br><strong>Ted</strong></p>
  <p style="font-size: 13px; color: #888; margin-top: 24px;">P.S. If you know another phan who'd love their own story, send them to <a href="https://myphishistory.com" style="color:#e8723a;">myphishistory.com</a></p>
</div>`.trim(),
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`Follow-up email failed for ${username}:`, errText);
        continue;
      }

      // Mark as sent in Stripe metadata
      await stripe.paymentIntents.update(pi.id, {
        metadata: { ...meta, follow_up_sent: 'true' },
      });

      sent++;
      console.log(`Follow-up sent to ${username} (${email})`);
    }

    return res.status(200).json({ sent });
  } catch (err) {
    console.error('Follow-up cron error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
