// Vercel serverless function: returns a freshly signed offerwall.me link.
// Env vars (set in Vercel, never in the page): OFFERWALL_API_KEY, OFFERWALL_SECRET
const crypto = require('crypto');

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const apiKey = process.env.OFFERWALL_API_KEY;
  const secret = process.env.OFFERWALL_SECRET;
  if (!apiKey || !secret) return res.status(500).json({ error: 'not_configured' });

  const uid = String((req.query && req.query.uid) || '');
  // Guest IDs are created by the page: "g_" + 24 hex characters
  if (!/^g_[0-9a-f]{24}$/.test(uid)) return res.status(400).json({ error: 'bad_user_id' });

  const expires = Math.floor(Date.now() / 1000) + 3600; // 1 hour (max allowed: 24h)
  const message = ['offerwall-user-v1', apiKey, uid, String(expires)].join('\n'); // no final newline
  const signature = crypto.createHmac('sha256', secret).update(message, 'utf8').digest('hex');

  const url = 'https://offerwall.me/offerwall/' + encodeURIComponent(apiKey) + '/' + encodeURIComponent(uid) +
    '?identityExpires=' + expires + '&identitySignature=' + signature;
  res.status(200).json({ url });
};
