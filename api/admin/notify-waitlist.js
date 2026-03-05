const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const ADMIN_SECRET = process.env.ADMIN_SECRET || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';

async function fetchAllWaitlistCustomers() {
  const customers = [];
  let page = undefined;
  let keepGoing = true;
  let guard = 0;

  while (keepGoing && guard < 20) {
    guard += 1;
    const result = await stripe.customers.search({
      query: 'metadata["waitlist"]:"true"',
      limit: 100,
      ...(page ? { page } : {})
    });

    customers.push(...result.data);
    keepGoing = Boolean(result.has_more && result.next_page);
    page = result.next_page || undefined;
  }

  return customers;
}

function buildEmailHtml(username) {
  const safeUsername = String(username || 'there')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#111;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background-color:#1a2744;padding:24px 32px;text-align:center;">
              <h1 style="margin:0;font-size:24px;color:#c5973f;letter-spacing:1px;">MyPhisHistory</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="color:#f5f5f5;font-size:18px;font-weight:600;margin:0 0 16px 0;">
                Hey ${safeUsername},
              </p>
              <p style="color:#ccc;font-size:15px;line-height:1.6;margin:0 0 16px 0;">
                You were one of the first to sign up. Your Phish Story is ready to order.
              </p>
              <p style="color:#ccc;font-size:15px;line-height:1.6;margin:0 0 24px 0;">
                14 pages. Era narratives, tier list, crown jewels, curated performances, editorial deep dives — all built from your Phish.net show history. Delivered to your inbox within 48 hours.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:0 0 24px 0;">
                    <a href="https://myphishistory.com" style="display:inline-block;background-color:#e85d04;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;padding:14px 40px;border-radius:8px;">
                      Get Your Phish Story
                    </a>
                  </td>
                </tr>
              </table>
              <p style="color:#888;font-size:13px;line-height:1.5;margin:0;">
                Thanks for being early.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #222;text-align:center;">
              <p style="color:#555;font-size:12px;margin:0;">
                MyPhisHistory · A passion project, not affiliated with Phish or Phish.net
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendLaunchEmail(to, username) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`
    },
    body: JSON.stringify({
      from: 'MyPhisHistory <support@myphishistory.com>',
      to,
      subject: 'Your Phish Story is ready',
      reply_to: 'mccooltm@gmail.com',
      html: buildEmailHtml(username)
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Resend failed (${response.status})`);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!ADMIN_SECRET) {
    return res.status(500).json({ error: 'Server misconfigured: ADMIN_SECRET is not set' });
  }
  if (!RESEND_API_KEY) {
    return res.status(500).json({ error: 'Server misconfigured: RESEND_API_KEY is not set' });
  }

  const secret = req.headers['x-admin-secret'];
  if (secret !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const customers = await fetchAllWaitlistCustomers();
    let sent = 0;
    let skipped = 0;
    let errors = 0;

    for (const customer of customers) {
      const metadata = customer.metadata || {};
      const alreadyNotified =
        metadata.waitlist_notified === 'true' ||
        metadata.notified === 'true';

      if (alreadyNotified) {
        skipped += 1;
        continue;
      }

      const email = (customer.email || '').trim();
      if (!email) {
        errors += 1;
        continue;
      }

      const username = metadata.phishnet_username || 'fan';

      try {
        await sendLaunchEmail(email, username);
        const now = new Date().toISOString();
        await stripe.customers.update(customer.id, {
          metadata: {
            ...metadata,
            waitlist_notified: 'true',
            waitlist_notified_at: now,
            notified: 'true',
            notified_at: now
          }
        });
        sent += 1;
      } catch (err) {
        errors += 1;
        console.error('Waitlist launch email failed:', customer.id, err.message);
      }
    }

    return res.status(200).json({ sent, skipped, errors });
  } catch (err) {
    console.error('Notify waitlist error:', err.message);
    return res.status(500).json({ error: 'Failed to notify waitlist.' });
  }
};
