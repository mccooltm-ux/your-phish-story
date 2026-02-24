const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'myphishistory-admin-2024';

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = req.headers['x-admin-secret'];
  if (secret !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Search Stripe customers with waitlist metadata
    const result = await stripe.customers.search({
      query: 'metadata["waitlist"]:"true"',
      limit: 100
    });

    const waitlist = result.data.map(c => ({
      id: c.id,
      email: c.email,
      name: c.name || null,
      username: c.metadata.phishnet_username || 'UNKNOWN',
      joined_at: c.metadata.joined_at || null,
      notified: c.metadata.notified === 'true',
      created: c.created
    }));

    // Sort by join date (oldest first — FIFO)
    waitlist.sort((a, b) => a.created - b.created);

    return res.status(200).json({ waitlist, count: waitlist.length });
  } catch (err) {
    console.error('Failed to fetch waitlist:', err.message);
    return res.status(500).json({ error: 'Failed to fetch waitlist', details: err.message });
  }
};
