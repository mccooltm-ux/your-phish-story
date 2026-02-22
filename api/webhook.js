const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Using Resend for email - simplest API, free tier = 100 emails/day
// Sign up at resend.com, get API key, set as RESEND_API_KEY env var
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL || 'mccooltm@gmail.com';
const PHISHNET_API_KEY = process.env.PHISHNET_API_KEY || '';

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
    const metadata = session.metadata;

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
      })
    };

    // Send notification email to Ted
    try {
      await sendNotificationEmail(orderDetails);
      console.log('Order notification sent:', orderDetails.phishnet_username);
    } catch (emailErr) {
      console.error('Failed to send notification email:', emailErr.message);
      // Don't fail the webhook - Stripe will retry, and we don't want duplicate charges
    }
  }

  // Always return 200 to acknowledge receipt
  return res.status(200).json({ received: true });
};

// Fetch attendance data from Phish.net and return cleaned show list
async function fetchAttendanceData(username) {
  try {
    const url = `https://api.phish.net/v5/attendance/username/${username}.json?apikey=${PHISHNET_API_KEY}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    const json = await resp.json();
    if (!json.data || !Array.isArray(json.data) || json.data.length === 0) return null;

    // Clean to only the fields that matter
    const shows = json.data.map(s => ({
      date: s.showdate,
      venue: s.venue,
      city: s.city,
      state: s.state,
      country: s.country,
      tour: s.tour_name,
      setlist_url: s.permalink
    }));

    return shows;
  } catch (err) {
    console.error('Failed to fetch attendance data:', err.message);
    return null;
  }
}

// Format shows into a clean text list
function formatShowList(shows) {
  return shows.map(s => {
    const loc = s.country === 'USA' ? `${s.city}, ${s.state}` : `${s.city}, ${s.country}`;
    return `${s.date} | ${s.venue}, ${loc} | ${s.tour}`;
  }).join('\n');
}

// Build the copy-paste Claude prompt
function buildClaudePrompt(username, shows) {
  const showList = formatShowList(shows);
  const showCount = shows.length;
  const firstShow = shows[0];
  const lastShow = shows[shows.length - 1];
  const setlistUrls = shows.map(s => s.setlist_url).join('\n');

  return `You are writing MyPhisHistory — a personalized deep-dive PDF for a Phish fan. The fan's Phish.net username is "${username}".

Here is their complete attendance history (${showCount} shows, ${firstShow.date} through ${lastShow.date}):

${showList}

Setlist URLs for research:
${setlistUrls}

Please create an extensive, personalized PDF document that includes:

1. **What Your Show History Says About You** — Analyze their attendance patterns. Are they a completist? A festival warrior? Coast-to-coaster? Era collector? Give them their fan identity with personality and specifics.

2. **A Letter to the Fan You Used to Be** — Write a personal, narrative letter addressed to the version of them that attended their first show (${firstShow.date} at ${firstShow.venue}). Make it vivid, emotional, and specific to THEIR timeline. Reference real Phish history, the eras they lived through, what was happening in the Phish world at each phase. This is the emotional centerpiece.

3. **By the Numbers** — Stats section: total shows, unique venues, states/countries, tours, years active, longest gap between shows, busiest year, most-visited venue, etc.

4. **Rare Catches & Notable Shows** — Research the setlists from their shows. Call out any rarities, bustouts, debut performances, famous jams, or historically significant shows they were at.

5. **Era Analysis** — Break down what eras of Phish they've experienced (1.0, 2.0, 3.0, 4.0) and what each era meant for the band and for their personal timeline.

Use the setlist URLs above to research specific shows. Be specific — reference actual songs, actual venues, actual dates. No generic filler. Write like a music journalist who deeply understands Phish and is genuinely impressed by this person's history. The tone should be warm, knowing, and celebratory.`;
}

async function sendNotificationEmail(order) {
  // Fetch and clean attendance data
  const shows = await fetchAttendanceData(order.phishnet_username);
  const claudePrompt = shows ? buildClaudePrompt(order.phishnet_username, shows) : null;

  const giftLine = order.is_gift
    ? `\n🎁 GIFT ORDER - Deliver to: ${order.gift_recipient_email}`
    : '';

  const subject = `New MyPhisHistory Order: ${order.phishnet_username}`;

  const promptSection = claudePrompt
    ? `\n\n========== COPY-PASTE CLAUDE PROMPT ==========\n${claudePrompt}\n========== END PROMPT ==========`
    : `\n\n⚠️ Could not fetch attendance data. Manual lookup needed:\nhttps://api.phish.net/v5/attendance/username/${order.phishnet_username}.json?apikey=${PHISHNET_API_KEY}`;

  const body = `
New order received!

Phishnet Username: ${order.phishnet_username}
Customer Email: ${order.customer_email}${giftLine}
Amount: ${order.amount_paid}
Payment ID: ${order.payment_id}
Date: ${order.created}

Phishnet profile: https://phish.net/user/${order.phishnet_username}
${shows ? `Shows found: ${shows.length}` : 'Shows: ⚠️ fetch failed'}

Action needed: Generate the PDF and email it to ${order.is_gift ? order.gift_recipient_email : order.customer_email}
${promptSection}
`.trim();

  const showListHtml = shows
    ? shows.map(s => {
        const loc = s.country === 'USA' ? `${s.city}, ${s.state}` : `${s.city}, ${s.country}`;
        return `<tr style="border-bottom:1px solid #eee;">
          <td style="padding:6px 8px;font-size:13px;white-space:nowrap;">${s.date}</td>
          <td style="padding:6px 8px;font-size:13px;">${s.venue}, ${loc}</td>
          <td style="padding:6px 8px;font-size:13px;color:#888;">${s.tour}</td>
        </tr>`;
      }).join('\n')
    : '';

  const promptHtml = claudePrompt
    ? `<div style="background:#1a1a2e;color:#e0e0e0;padding:16px;border-radius:8px;margin:20px 0;font-family:monospace;font-size:12px;white-space:pre-wrap;line-height:1.5;max-height:600px;overflow:auto;">${claudePrompt.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\*\*(.*?)\*\*/g, '<strong style="color:#e8723a;">$1</strong>')}</div>
      <p style="text-align:center;margin:8px 0;">
        <a href="#" onclick="return false;" style="background:#e8723a;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">↑ Copy the prompt above and paste into Claude ↑</a>
      </p>`
    : `<div style="background:#fff3cd;padding:16px;border-radius:8px;margin:20px 0;font-size:13px;">⚠️ Could not fetch attendance data automatically. <a href="https://api.phish.net/v5/attendance/username/${order.phishnet_username}.json?apikey=${PHISHNET_API_KEY}">Click here for manual lookup</a></div>`;

  const htmlBody = `
    <div style="font-family: -apple-system, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px;">
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
        ${order.is_gift ? `<tr style="border-bottom: 1px solid #eee; background: #fff8f0;">
          <td style="padding: 10px 0; color: #e8723a; font-size: 14px;">🎁 Gift - Deliver To</td>
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

      ${shows ? `<h3 style="color:#333;margin-bottom:8px;">Attendance History (${shows.length} shows)</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-family:-apple-system,sans-serif;">
        <tr style="background:#f5f5f5;">
          <th style="padding:8px;text-align:left;font-size:12px;color:#888;">Date</th>
          <th style="padding:8px;text-align:left;font-size:12px;color:#888;">Venue & Location</th>
          <th style="padding:8px;text-align:left;font-size:12px;color:#888;">Tour</th>
        </tr>
        ${showListHtml}
      </table>` : ''}

      <h3 style="color:#e8723a;margin-bottom:8px;">📋 Copy-Paste Claude Prompt</h3>
      ${promptHtml}

      <p style="color: #888; font-size: 13px; margin-top: 20px;">
        <strong>Action:</strong> Generate the PDF and email to <strong>${order.is_gift ? order.gift_recipient_email : order.customer_email}</strong>
      </p>
    </div>
  `.trim();

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`
    },
    body: JSON.stringify({
      from: 'MyPhisHistory <onboarding@resend.dev>',
      to: NOTIFICATION_EMAIL,
      subject: subject,
      text: body,
      html: htmlBody
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Resend API error: ${response.status} - ${errText}`);
  }
}

// Vercel config: disable body parsing so we get the raw body for Stripe signature verification
module.exports.config = {
  api: {
    bodyParser: false
  }
};

// Helper to get raw body for Stripe signature verification
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
