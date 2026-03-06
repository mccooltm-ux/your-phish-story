const https = require('https');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const ERA_RANGES = [
  { label: '1.0', start: '1983-01-01', end: '2000-12-31' },
  { label: '2.0', start: '2003-01-01', end: '2004-12-31' },
  { label: '3.0', start: '2009-01-01', end: '2017-12-31' },
  { label: '4.0', start: '2018-01-01', end: null }
];

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username, email, share } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Phishnet username is required.' });
    }

    const apiKey = process.env.PHISHNET_API_KEY;
    const showData = await fetchJson('https://api.phish.net/v5/attendance/username/' + encodeURIComponent(username) + '.json?apikey=' + apiKey);

    if (!showData || !showData.data || showData.data.length === 0) {
      return res.status(404).json({ error: 'No shows found for this username. Check spelling or add shows on phish.net.' });
    }

    const shows = showData.data;
    const totalShows = shows.length;
    const years = [...new Set(shows.map(s => new Date(s.showdate).getFullYear()))].sort((a, b) => a - b);
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
    const showsByYearRange = buildShowsByYearRange(showsByYear, firstYear, lastYear);
    const eraBreakdown = buildEraBreakdown(shows);
    const longestDrought = computeLongestDrought(sorted);
    const statesByFrequency = buildStatesByFrequency(shows);
    const topSongs = await buildTopSongs(shows, apiKey);
    const tagline = buildTagline({
      totalShows,
      topVenue: topVenues[0] || null,
      months: sorted.map(s => new Date(s.showdate).getMonth() + 1),
      eraBreakdown,
      yearsActive
    });

    if (!share) {
      try {
        await trackSnapshotLead(username, totalShows);
      } catch (trackErr) {
        console.error('Snapshot tracking failed:', trackErr.message);
      }

      try {
        const { Resend } = require('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: 'MyPhisHistory <support' + '@' + 'myphishistory.com>',
          to: process.env.NOTIFICATION_EMAIL,
          subject: 'Free Snapshot: ' + username + ' (' + totalShows + ' shows)',
          html: '<div style="font-family:sans-serif;padding:20px;"><h2>New Free Snapshot Lead</h2><p><strong>Username:</strong> ' + username + '</p><p><strong>Shows:</strong> ' + totalShows + '</p><p><strong>Years:</strong> ' + firstYear + '-' + lastYear + '</p><p><strong>Venues:</strong> ' + uniqueVenues + '</p></div>'
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
        uniqueVenues, topVenues, showsByYear, showsByYearRange, states,
        peakYear: peakYear ? { year: parseInt(peakYear[0]), count: peakYear[1] } : null,
        estimatedSongs,
        topSongs,
        eraBreakdown,
        longestDrought,
        statesByFrequency,
        tagline
      }
    });
  } catch (err) {
    console.error('Snapshot generation error:', err.message);
    return res.status(500).json({ error: 'Failed to generate snapshot. Please try again.' });
  }
};

async function trackSnapshotLead(username, totalShows) {
  if (!process.env.STRIPE_SECRET_KEY) return;
  const safeUsername = String(username || '').replace(/"/g, '').trim();
  if (!safeUsername) return;

  const now = new Date().toISOString();
  const query = `metadata["snapshot"]:"true" AND metadata["phishnet_username"]:"${safeUsername}"`;
  const search = await stripe.customers.search({ query, limit: 1 });
  const existing = search.data && search.data[0] ? search.data[0] : null;

  if (existing) {
    const previousCount = parseInt(existing.metadata?.snapshot_count || '0', 10);
    const nextCount = Number.isFinite(previousCount) ? previousCount + 1 : 1;
    await stripe.customers.update(existing.id, {
      metadata: {
        ...(existing.metadata || {}),
        snapshot: 'true',
        phishnet_username: safeUsername,
        snapshot_count: String(nextCount),
        snapshot_last_at: now,
        snapshot_total_shows: String(totalShows)
      }
    });
    return;
  }

  await stripe.customers.create({
    metadata: {
      snapshot: 'true',
      phishnet_username: safeUsername,
      snapshot_count: '1',
      snapshot_first_at: now,
      snapshot_last_at: now,
      snapshot_total_shows: String(totalShows)
    }
  });
}

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

function buildShowsByYearRange(showsByYear, firstYear, lastYear) {
  const years = {};
  for (let y = firstYear; y <= lastYear; y += 1) {
    years[y] = showsByYear[y] || 0;
  }
  return years;
}

function buildEraBreakdown(shows) {
  const counts = ERA_RANGES.map((range) => ({ label: range.label, count: 0 }));
  for (const show of shows) {
    const date = show.showdate;
    for (let i = 0; i < ERA_RANGES.length; i += 1) {
      const range = ERA_RANGES[i];
      const inRange = date >= range.start && (range.end ? date <= range.end : true);
      if (inRange) {
        counts[i].count += 1;
        break;
      }
    }
  }
  return counts.filter((entry) => entry.count > 0);
}

function computeLongestDrought(sortedShows) {
  if (sortedShows.length < 2) {
    return null;
  }

  let maxDays = 0;
  let gapStart = null;
  let gapEnd = null;

  for (let i = 1; i < sortedShows.length; i += 1) {
    const prev = new Date(sortedShows[i - 1].showdate + 'T12:00:00Z');
    const current = new Date(sortedShows[i].showdate + 'T12:00:00Z');
    const diffDays = Math.round((current - prev) / (1000 * 60 * 60 * 24));
    if (diffDays > maxDays) {
      maxDays = diffDays;
      gapStart = sortedShows[i - 1].showdate;
      gapEnd = sortedShows[i].showdate;
    }
  }

  return gapStart && gapEnd ? { days: maxDays, start: gapStart, end: gapEnd } : null;
}

function buildStatesByFrequency(shows) {
  const counts = {};
  for (const show of shows) {
    const value = (show.state || show.country || 'Unknown').trim();
    counts[value] = (counts[value] || 0) + 1;
  }

  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

async function buildTopSongs(shows, apiKey) {
  const uniqueDates = [...new Set(shows.map((s) => s.showdate).filter(Boolean))];
  const counts = new Map();
  const displayNames = new Map();
  const concurrency = 6;

  for (let i = 0; i < uniqueDates.length; i += concurrency) {
    const batch = uniqueDates.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (showDate) => {
        const songs = await fetchSongsForShowDate(showDate, apiKey);
        return songs;
      })
    );

    for (const songs of batchResults) {
      for (const rawSong of songs) {
        const key = normalizeSong(rawSong);
        if (!key) continue;
        counts.set(key, (counts.get(key) || 0) + 1);
        if (!displayNames.has(key)) {
          displayNames.set(key, prettifySongName(rawSong));
        }
      }
    }
  }

  return [...counts.entries()]
    .map(([key, count]) => ({ name: displayNames.get(key) || key, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 5);
}

async function fetchSongsForShowDate(showDate, apiKey) {
  try {
    const payload = await fetchJson(
      'https://api.phish.net/v5/setlists/showdate/' + encodeURIComponent(showDate) + '.json?apikey=' + apiKey
    );

    const songs = new Set();
    extractSongsFromPayload(payload, songs);
    return songs;
  } catch (err) {
    return new Set();
  }
}

function extractSongsFromPayload(node, collector) {
  if (!node) return;

  if (Array.isArray(node)) {
    for (const item of node) {
      extractSongsFromPayload(item, collector);
    }
    return;
  }

  if (typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      const lowerKey = key.toLowerCase();

      if (
        typeof value === 'string' &&
        (lowerKey === 'song' || lowerKey === 'songname' || lowerKey === 'title' || lowerKey === 'name')
      ) {
        const cleaned = cleanSongName(value);
        if (cleaned) collector.add(cleaned);
      }

      if (typeof value === 'string' && lowerKey === 'setlistdata') {
        extractSongsFromSetlistHtml(value, collector);
      }

      extractSongsFromPayload(value, collector);
    }
  }
}

function extractSongsFromSetlistHtml(html, collector) {
  const anchorTextRegex = /<a[^>]*>([^<]+)<\/a>/gi;
  let match = anchorTextRegex.exec(html);
  while (match) {
    const cleaned = cleanSongName(match[1]);
    if (cleaned) collector.add(cleaned);
    match = anchorTextRegex.exec(html);
  }
}

function cleanSongName(name) {
  if (!name || typeof name !== 'string') return '';
  const cleaned = name
    .replace(/\s+/g, ' ')
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .trim();
  if (!cleaned || cleaned.length < 2 || cleaned.length > 80) return '';
  return cleaned;
}

function normalizeSong(song) {
  return cleanSongName(song)
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function prettifySongName(song) {
  const cleaned = cleanSongName(song);
  if (!cleaned) return '';
  return cleaned;
}

function buildTagline({ totalShows, topVenue, months, eraBreakdown, yearsActive }) {
  if (totalShows >= 100) {
    return 'Certified lifer.';
  }

  if (totalShows >= 50 && totalShows <= 99) {
    return 'Deep in it.';
  }

  if (topVenue && totalShows > 0 && topVenue.count / totalShows >= 0.75) {
    return topVenue.name + ' is your living room.';
  }

  if (months.length > 0 && months.every((m) => m >= 6 && m <= 8)) {
    return 'Summer tour or bust.';
  }

  const hasOnePointZero = eraBreakdown.some((era) => era.label === '1.0');
  const hasFourPointZero = eraBreakdown.some((era) => era.label === '4.0');
  if (hasOnePointZero && hasFourPointZero) {
    return "You've seen every version of this band.";
  }

  return totalShows + ' shows. ' + yearsActive + ' years. Your Phish story.';
}
