// /api/deliver.js — Send finished PDF to customer via Resend
// Called by Ted (or automation) after the PDF is generated
//
// POST /api/deliver
// Body (JSON):
//   {
//     "to": "customer@email.com",
//     "username": "phishnet_username",
//     "pdf_url": "https://... or base64 data URI",
//     "secret": "delivery_secret"
//   }
//
// Optional body fields:
//   "subject": custom subject line
//   "message": custom body message

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const DELIVERY_SECRET = process.env.DELIVERY_SECRET || 'myphishistory-deliver-2024';

module.exports = async function handler(req, res) {
  // CORS headers for flexibility
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Parse body
  const { to, username, pdf_url, pdf_base64, secret, subject, message } = req.body || {};

  // Auth check — simple shared secret to prevent abuse
  if (secret !== DELIVERY_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Validate required fields
  if (!to || !username) {
    return res.status(400).json({ error: 'Missing required fields: to, username' });
  }

  if (!pdf_url && !pdf_base64) {
    return res.status(400).json({ error: 'Must provide either pdf_url or pdf_base64' });
  }

  try {
    // Build the attachment
    let attachment;
    const filename = `MyPhisHistory-${username}.pdf`;

    if (pdf_base64) {
      // Direct base64 content
      attachment = {
        filename,
        content: pdf_base64
      };
    } else if (pdf_url) {
      // Fetch the PDF from URL
      const pdfResp = await fetch(pdf_url);
      if (!pdfResp.ok) {
        throw new Error(`Failed to fetch PDF from URL: ${pdfResp.status}`);
      }
      const pdfBuffer = await pdfResp.arrayBuffer();
      const base64 = Buffer.from(pdfBuffer).toString('base64');
      attachment = {
        filename,
        content: base64
      };
    }

    // Build email
    const emailSubject = subject || `Your MyPhisHistory is Ready, ${username}!`;

    const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">

    <!-- Header -->
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="color:#f5f5f5;font-size:28px;margin:0 0 8px 0;letter-spacing:-0.5px;">
        MyPhisHistory
      </h1>
      <div style="width:60px;height:2px;background:linear-gradient(90deg,#e85d04,#f48c06);margin:0 auto;"></div>
    </div>

    <!-- Main Content -->
    <div style="background:#141414;border:1px solid #2a2a2a;border-radius:12px;padding:32px;margin-bottom:24px;">
      <p style="color:#e0e0e0;font-size:16px;line-height:1.6;margin:0 0 16px 0;">
        Hey ${username},
      </p>
      <p style="color:#c0c0c0;font-size:15px;line-height:1.6;margin:0 0 16px 0;">
        ${message || 'Your personalized Phish show history document is ready! We dug deep into your attendance record and put together something special.'}
      </p>
      <p style="color:#c0c0c0;font-size:15px;line-height:1.6;margin:0 0 24px 0;">
        Your PDF is attached to this email. Download it, save it, share it with your crew.
      </p>

      <!-- CTA -->
      <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:20px;text-align:center;">
        <p style="color:#f48c06;font-size:14px;font-weight:600;margin:0 0 4px 0;">
          YOUR DOCUMENT IS ATTACHED
        </p>
        <p style="color:#888;font-size:13px;margin:0;">
          ${filename}
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding:16px 0;">
      <p style="color:#666;font-size:12px;margin:0 0 4px 0;">
        MyPhisHistory &mdash; Your shows. Your story.
      </p>
      <p style="color:#555;font-size:11px;margin:0;">
        <a href="https://myphishistory.com" style="color:#555;text-decoration:none;">myphishistory.com</a>
      </p>
    </div>

  </div>
</body>
</html>`.trim();

    const textBody = `Hey ${username},\n\n${message || 'Your personalized Phish show history document is ready!'}\n\nYour PDF is attached to this email.\n\n- MyPhisHistory\nhttps://myphishistory.com`;

    // Send via Resend
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: 'MyPhisHistory <delivery@myphishistory.com>',
        to: to,
        subject: emailSubject,
        html: emailHtml,
        text: textBody,
        attachments: [attachment]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Resend API error: ${response.status} - ${errText}`);
    }

    const result = await response.json();

    console.log(`PDF delivered to ${to} for user ${username}, email ID: ${result.id}`);

    return res.status(200).json({
      success: true,
      email_id: result.id,
      delivered_to: to,
      username: username
    });

  } catch (err) {
    console.error('Delivery failed:', err.message);
    return res.status(500).json({
      error: 'Delivery failed',
      details: err.message
    });
  }
};
