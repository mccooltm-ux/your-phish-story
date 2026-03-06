const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const ADMIN_SECRET = process.env.ADMIN_SECRET || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const PHISHNET_FEEDBACK_THREAD_URL = 'https://forum.phish.net/forum/show/1380220703#page=1';

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

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildLaunchEmailHtml(username) {
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

function buildForumFeedbackEmailHtml(username) {
  const safeUsername = escapeHtml(username || 'there');
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
              <p style="color:#f5f5f5;font-size:18px;font-weight:600;margin:0 0 16px 0;">Hey ${safeUsername},</p>
              <p style="color:#ccc;font-size:15px;line-height:1.6;margin:0 0 16px 0;">
                Quick favor: if you’ve tried the snapshot, could you post honest feedback on this phish.net thread?
              </p>
              <p style="color:#ccc;font-size:15px;line-height:1.6;margin:0 0 24px 0;">
                What looks right, what looks off, and what would make this more useful for fans.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:0 0 24px 0;">
                    <a href="${PHISHNET_FEEDBACK_THREAD_URL}" style="display:inline-block;background-color:#e85d04;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;padding:14px 40px;border-radius:8px;">
                      Post Feedback in Thread
                    </a>
                  </td>
                </tr>
              </table>
              <p style="color:#888;font-size:13px;line-height:1.5;margin:0;">Thanks for helping shape this early.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #222;text-align:center;">
              <p style="color:#555;font-size:12px;margin:0;">MyPhisHistory · Not affiliated with Phish or Phish.net</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendEmail({ to, username, campaign }) {
  const isFeedback = campaign === 'forum_feedback';
  const subject = isFeedback
    ? 'Quick favor: honest feedback on this phish.net thread?'
    : 'Your Phish Story is ready';
  const html = isFeedback
    ? buildForumFeedbackEmailHtml(username)
    : buildLaunchEmailHtml(username);
  const attachments = isFeedback ? [await getFeedbackPdfAttachment()] : [];

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`
    },
    body: JSON.stringify({
      from: 'MyPhisHistory <support@myphishistory.com>',
      to,
      subject,
      reply_to: 'mccooltm@gmail.com',
      html,
      attachments
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Resend failed (${response.status})`);
  }
}

let feedbackPdfAttachmentCache = null;

async function getFeedbackPdfAttachment() {
  if (feedbackPdfAttachmentCache) {
    return feedbackPdfAttachmentCache;
  }

  const pdfUrl = 'https://myphishistory.com/fishman_phish_story.pdf';
  const response = await fetch(pdfUrl);
  if (!response.ok) {
    throw new Error('Could not load sample PDF attachment');
  }

  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  feedbackPdfAttachmentCache = {
    filename: 'myphishistory_sample_report.pdf',
    content: base64
  };
  return feedbackPdfAttachmentCache;
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
    const campaign = String(req.body?.campaign || 'launch').trim();
    const validCampaigns = new Set(['launch', 'forum_feedback']);
    if (!validCampaigns.has(campaign)) {
      return res.status(400).json({ error: 'Invalid campaign type.' });
    }

    const selectedIds = Array.isArray(req.body?.customer_ids)
      ? req.body.customer_ids.map((id) => String(id || '').trim()).filter(Boolean)
      : null;
    const selectedSet = selectedIds && selectedIds.length ? new Set(selectedIds) : null;

    const customers = await fetchAllWaitlistCustomers();
    let sent = 0;
    let skipped = 0;
    let errors = 0;

    for (const customer of customers) {
      if (selectedSet && !selectedSet.has(customer.id)) {
        continue;
      }

      const metadata = customer.metadata || {};
      const alreadyNotified = campaign === 'forum_feedback'
        ? metadata.waitlist_feedback_requested === 'true'
        : (metadata.waitlist_notified === 'true' || metadata.notified === 'true');

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
        await sendEmail({ to: email, username, campaign });
        const now = new Date().toISOString();
        const campaignMetadata = campaign === 'forum_feedback'
          ? {
              waitlist_feedback_requested: 'true',
              waitlist_feedback_requested_at: now
            }
          : {
              waitlist_notified: 'true',
              waitlist_notified_at: now,
              notified: 'true',
              notified_at: now
            };
        await stripe.customers.update(customer.id, {
          metadata: {
            ...metadata,
            ...campaignMetadata
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
