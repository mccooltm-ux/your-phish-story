const { Resend } = require('resend');
const NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL || '';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!NOTIFICATION_EMAIL) {
    return res.status(500).json({ error: 'Server misconfigured: NOTIFICATION_EMAIL is not set' });
  }

  try {
    const { name, email, message } = req.body;

    if (!email || !message) {
      return res.status(400).json({ error: 'Email and message are required.' });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    await resend.emails.send({
      from: 'MyPhisHistory <support@myphishistory.com>',
      to: NOTIFICATION_EMAIL,
      subject: `Contact Form: ${name || 'Anonymous'}`,
      replyTo: email,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2 style="color: #e85d04;">New Contact Form Submission</h2>
          <p><strong>From:</strong> ${name || 'Not provided'}</p>
          <p><strong>Email:</strong> ${email}</p>
          <hr style="border: 1px solid #333;">
          <p style="white-space: pre-wrap;">${message}</p>
        </div>
      `,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Contact form error:', err.message);
    return res.status(500).json({ error: 'Failed to send message. Please try again.' });
  }
};
