const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const customers = await fetchAllWaitlistCustomers();

    let combinedShows = 0;
    const states = new Set();
    const publicUsernames = [];

    customers.forEach((customer) => {
      const metadata = customer.metadata || {};
      const showCount = parseInt(metadata.waitlist_show_count || '0', 10);
      if (Number.isFinite(showCount)) combinedShows += showCount;

      const csv = (metadata.waitlist_states_csv || '').trim();
      if (csv) {
        csv.split(',').map((item) => item.trim()).filter(Boolean).forEach((item) => states.add(item));
      }

      if (metadata.waitlist_public === 'true' && metadata.phishnet_username) {
        publicUsernames.push(metadata.phishnet_username);
      }
    });

    return res.status(200).json({
      total_count: customers.length,
      combined_shows: combinedShows,
      states_represented: states.size,
      public_usernames: [...new Set(publicUsernames)]
    });
  } catch (err) {
    console.error('Waitlist stats error:', err.message);
    return res.status(500).json({ error: 'Failed to load waitlist stats.' });
  }
};
