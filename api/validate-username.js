export default async function handler(req, res) {
  const { username } = req.query;
  if (!username) {
    return res.status(400).json({ error: 'Username required' });
  }
  const apiKey = process.env.PHISHNET_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }
  try {
    const url = 'https://api.phish.net/v5/shows/username/' + encodeURIComponent(username) + '.json?apikey=' + apiKey;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const data = await response.json();
    res.setHeader('Cache-Control', 's-maxage=60');
    return res.status(200).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'Phish.net API unavailable' });
  }
}