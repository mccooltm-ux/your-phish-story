const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL || '';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!NOTIFICATION_EMAIL) {
    return res.status(500).json({ error: 'Server misconfigured: NOTIFICATION_EMAIL is not set' });
  }

  try {
    const { phishnet_username, email, full_name } = req.body;

    if (!phishnet_username || !email) {
      return res.status(400).json({ error: 'Username and email are required.' });
    }

    // Check for duplicate — search Stripe customers by email with waitlist metadata
    const existing = await stripe.customers.search({
      query: `email:"${email}" AND metadata["waitlist"]:"true"`
    });
    if (existing.data.length > 0) {
      return res.status(200).json({ success: true, message: 'Already on the waitlist.' });
    }

    // Create Stripe customer as waitlist record
    await stripe.customers.create({
      email: email,
      name: full_name || null,
      metadata: {
        waitlist: 'true',
        phishnet_username: phishnet_username,
        joined_at: new Date().toISOString(),
        notified: 'false'
      }
    });

    // Notify admin
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: 'MyPhisHistory <noreply@myphishistory.com>',
        to: NOTIFICATION_EMAIL,
        subject: `Waitlist: ${phishnet_username}`,
        text: `New waitlist signup:\n\nUsername: ${phishnet_username}\nEmail: ${email}\nName: ${full_name || 'Not provided'}\nTime: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}`,
        html: `
          <div style="font-family:-apple-system,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
            <div style="display:inline-block;background:#f59e0b;color:white;padding:4px 12px;border-radius:12px;font-size:13px;font-weight:600;margin-bottom:8px;">Waitlist</div>
            <h2 style="color:#333;margin-bottom:16px;">New waitlist signup</h2>
            <table style="width:100%;border-collapse:collapse;">
              <tr style="border-bottom:1px solid #eee;"><td style="padding:8px 0;color:#888;font-size:14px;">Username</td><td style="padding:8px 0;font-weight:600;">${phishnet_username}</td></tr>
              <tr style="border-bottom:1px solid #eee;"><td style="padding:8px 0;color:#888;font-size:14px;">Email</td><td style="padding:8px 0;">${email}</td></tr>
              ${full_name ? `<tr style="border-bottom:1px solid #eee;"><td style="padding:8px 0;color:#888;font-size:14px;">Name</td><td style="padding:8px 0;">${full_name}</td></tr>` : ''}
            </table>
          </div>
        `.trim()
      })
    });

    // Send confirmation to the customer
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: 'MyPhisHistory <noreply@myphishistory.com>',
        to: email,
        subject: `You're on the list — MyPhisHistory`,
        text: `Hey ${full_name || 'there'},\n\nYou're on the waitlist for MyPhisHistory. We're processing our first wave of orders and will email you as soon as we're ready for the next batch.\n\nYour Phishnet username (${phishnet_username}) is saved — you won't need to re-enter anything.\n\nThanks for your patience.\n\n— MyPhisHistory`,
        html: `
          <div style="font-family:-apple-system,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
            <h2 style="color:#e8723a;">You're on the list.</h2>
            <p style="color:#555;line-height:1.6;">Hey ${full_name || 'there'},</p>
            <p style="color:#555;line-height:1.6;">We're processing our first wave of orders and will email you as soon as we're ready for the next batch.</p>
            <p style="color:#555;line-height:1.6;">Your Phishnet username (<strong>${phishnet_username}</strong>) is saved — you won't need to re-enter anything.</p>
            <p style="color:#555;line-height:1.6;">Thanks for your patience.</p>
            <p style="color:#888;font-size:13px;margin-top:24px;">— MyPhisHistory</p>
          </div>
        `.trim()
      })
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Waitlist error:', err.message);
    return res.status(500).json({ error: 'Failed to join waitlist. Please try again.' });
  }
};
