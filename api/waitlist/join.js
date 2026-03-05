const https = require('https');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL || '';

function isValidEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function normalizeUsername(value) {
  const username = typeof value === 'string' ? value.trim() : '';
  return /^[A-Za-z0-9._-]{2,40}$/.test(username) ? username : '';
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (resp) => {
      let data = '';
      resp.on('data', (chunk) => { data += chunk; });
      resp.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (_) {
          reject(new Error('Invalid JSON response'));
        }
      });
    }).on('error', reject);
  });
}

async function fetchAttendanceStats(username) {
  const apiKey = process.env.PHISHNET_API_KEY || '';
  if (!apiKey) {
    throw new Error('Server misconfigured: PHISHNET_API_KEY is not set');
  }

  const url = 'https://api.phish.net/v5/attendance/username/' + encodeURIComponent(username) + '.json?apikey=' + apiKey;
  const payload = await fetchJson(url);
  const shows = Array.isArray(payload?.data) ? payload.data : [];
  if (shows.length === 0) {
    throw new Error('No shows found for this username.');
  }

  const stateCounts = {};
  shows.forEach((show) => {
    const raw = (show.state || show.country || '').trim();
    if (!raw) return;
    stateCounts[raw] = (stateCounts[raw] || 0) + 1;
  });

  const states = Object.keys(stateCounts).sort((a, b) => stateCounts[b] - stateCounts[a] || a.localeCompare(b));
  return { showCount: shows.length, states };
}

async function findCustomerByEmail(email) {
  const result = await stripe.customers.search({
    query: `email:"${email.replace(/"/g, '')}"`,
    limit: 20
  });

  if (!result.data.length) return null;
  const waitlistCustomer = result.data.find((customer) => customer.metadata?.waitlist === 'true');
  return waitlistCustomer || result.data[0];
}

async function sendWaitlistAlert(details) {
  if (!RESEND_API_KEY || !NOTIFICATION_EMAIL) return;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`
    },
    body: JSON.stringify({
      from: 'MyPhisHistory <support@myphishistory.com>',
      to: NOTIFICATION_EMAIL,
      subject: `New waitlist signup: ${details.username}`,
      reply_to: details.email,
      html: `
        <div style="font-family:Inter,system-ui,-apple-system,sans-serif;background:#0d1117;color:#e6edf3;padding:20px;">
          <h2 style="margin:0 0 12px 0;font-size:18px;color:#e8916e;">New Waitlist Signup</h2>
          <p style="margin:0 0 6px 0;"><strong>Username:</strong> ${details.username}</p>
          <p style="margin:0 0 6px 0;"><strong>Email:</strong> ${details.email}</p>
          <p style="margin:0 0 6px 0;"><strong>Shows:</strong> ${details.showCount}</p>
          <p style="margin:0 0 6px 0;"><strong>States:</strong> ${details.states.join(', ') || '—'}</p>
          <p style="margin:0;"><strong>Public waitlist opt-in:</strong> ${details.showOnPublic ? 'Yes' : 'No'}</p>
        </div>
      `
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Failed to send waitlist alert');
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username, email, show_on_public } = req.body || {};
    const normalizedUsername = normalizeUsername(username);
    const normalizedEmail = typeof email === 'string' ? email.trim() : '';
    const showOnPublic = Boolean(show_on_public);

    if (!normalizedUsername) {
      return res.status(400).json({ error: 'Enter a valid Phish.net username.' });
    }
    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }

    const attendance = await fetchAttendanceStats(normalizedUsername);
    const now = new Date().toISOString();
    const metadata = {
      waitlist: 'true',
      phishnet_username: normalizedUsername,
      waitlist_public: showOnPublic ? 'true' : 'false',
      waitlist_show_count: String(attendance.showCount),
      waitlist_states_csv: attendance.states.join(','),
      waitlist_joined_at: now
    };

    const existing = await findCustomerByEmail(normalizedEmail);
    if (existing) {
      await stripe.customers.update(existing.id, {
        email: normalizedEmail,
        metadata: {
          ...(existing.metadata || {}),
          ...metadata
        }
      });
      return res.status(200).json({ success: true, updated: true });
    }

    await stripe.customers.create({
      email: normalizedEmail,
      metadata
    });

    try {
      await sendWaitlistAlert({
        username: normalizedUsername,
        email: normalizedEmail,
        showCount: attendance.showCount,
        states: attendance.states,
        showOnPublic
      });
    } catch (emailErr) {
      console.error('Waitlist alert email failed:', emailErr.message);
    }

    return res.status(200).json({ success: true, updated: false });
  } catch (err) {
    console.error('Waitlist join error:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to join waitlist.' });
  }
};
