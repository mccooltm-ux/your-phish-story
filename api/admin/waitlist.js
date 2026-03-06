const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!ADMIN_SECRET) {
    return res.status(500).json({ error: 'Server misconfigured: ADMIN_SECRET is not set' });
  }

  const secret = req.headers['x-admin-secret'];
  if (secret !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    if (req.method === 'POST') {
      const customerId = typeof req.body?.customer_id === 'string' ? req.body.customer_id.trim() : '';
      if (!customerId) {
        return res.status(400).json({ error: 'customer_id is required' });
      }

      const customer = await stripe.customers.retrieve(customerId);
      const metadata = customer.metadata || {};

      await stripe.customers.update(customerId, {
        metadata: {
          ...metadata,
          waitlist: 'false',
          waitlist_public: 'false',
          phishnet_username: '',
          waitlist_show_count: '',
          waitlist_states_csv: '',
          waitlist_joined_at: '',
          waitlist_notified: '',
          waitlist_notified_at: '',
          notified: '',
          notified_at: ''
        }
      });

      return res.status(200).json({ success: true });
    }

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
      joined_at: c.metadata.waitlist_joined_at || c.metadata.joined_at || null,
      notified: c.metadata.waitlist_notified === 'true' || c.metadata.notified === 'true',
      notified_at: c.metadata.waitlist_notified_at || c.metadata.notified_at || null,
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
