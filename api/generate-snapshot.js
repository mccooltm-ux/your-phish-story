const https = require('https');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username, email, share } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Phishnet username is required.' });
    }
    if (!share && !email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    const apiKey = process.env.PHISHNET_API_KEY;
    const showData = await fetchJson('https://api.phish.net/v5/attendance/username/' + encodeURIComponent(username) + '.json?apikey=' + apiKey);

    if (!showData || !showData.data || showData.data.length === 0) {
      return res.status(404).json({ error: 'No shows found for this username. Check spelling or add shows on phish.net.' });
    }

    const shows = showData.data;
    const totalShows = shows.length;
    const years = [...new Set(shows.map(s => new Date(s.showdate).getFullYear()))].sort();
    const firstYear = years[0];
    const lastYear = years[years.length - 1];
    const yearsActive = lastYear - firstYear;
    const sorted = [...shows].sort((a, b) => new Date(a.showdate) - new Date(b.showdate));
    const firstShow = sorted[0];
    const lastShow = sorted[sorted.length - 1];

    const venueMap = {};
    shows.forEach(s => {
      const venue = s.venue || s.venuename || 'Unknown';
      venueMap[venue] = (venueMap[venue] || 0) + 1;
    });
    const uniqueVenues = Object.keys(venueMap).length;
    const topVenues = Object.entries(venueMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const showsByYear = {};
    shows.forEach(s => {
      const y = new Date(s.showdate).getFullYear();
      showsByYear[y] = (showsByYear[y] || 0) + 1;
    });

    const states = [...new Set(shows.map(s => s.state || s.country || 'Unknown').filter(Boolean))];
    const peakYear = Object.entries(showsByYear).sort((a, b) => b[1] - a[1])[0];
    const estimatedSongs = Math.min(Math.round(totalShows * 13.5), 900);

    if (!share) {
      try {
        const { Resend } = require('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: 'MyPhisHistory <support' + '@' + 'myphishistory.com>',
          to: process.env.NOTIFICATION_EMAIL,
          subject: 'Free Snapshot: ' + username + ' (' + totalShows + ' shows)',
          html: '<div style="font-family:sans-serif;padding:20px;"><h2>New Free Snapshot Lead</h2><p><strong>Username:</strong> ' + username + '</p><p><strong>Email:</strong> ' + email + '</p><p><strong>Shows:</strong> ' + totalShows + '</p><p><strong>Years:</strong> ' + firstYear + '-' + lastYear + '</p><p><strong>Venues:</strong> ' + uniqueVenues + '</p></div>'
        });
      } catch (emailErr) {
        console.error('Snapshot notification email failed:', emailErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      snapshot: {
        username, totalShows, yearsActive, firstYear, lastYear,
        firstShow: { date: firstShow.showdate, venue: firstShow.venue || firstShow.venuename || 'Unknown', city: firstShow.city || '', state: firstShow.state || '' },
        lastShow: { date: lastShow.showdate, venue: lastShow.venue || lastShow.venuename || 'Unknown', city: lastShow.city || '', state: lastShow.state || '' },
        uniqueVenues, topVenues, showsByYear, states,
        peakYear: peakYear ? { year: parseInt(peakYear[0]), count: peakYear[1] } : null,
        estimatedSongs
      }
    });
  } catch (err) {
    console.error('Snapshot generation error:', err.message);
    return res.status(500).json({ error: 'Failed to generate snapshot. Please try again.' });
  }
};

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (resp) => {
      let data = '';
      resp.on('data', chunk => data += chunk);
      resp.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON from Phish.net')); }
      });
    }).on('error', reject);
  });
}