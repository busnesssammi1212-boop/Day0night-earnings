// offerwall.me S2S postback. Env: OFFERWALL_SECRET, SUPABASE_URL, SUPABASE_SERVICE_KEY, HOLD_DAYS (optional, default 3)
const crypto = require('crypto');

const sb = (path, opts = {}) =>
  fetch(process.env.SUPABASE_URL + '/rest/v1/' + path, {
    ...opts,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_KEY,
      Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });

module.exports = async (req, res) => {
  const q = req.query || {};
  const subId = String(q.subId || ''), transId = String(q.transId || '');
  const reward = String(q.reward || ''), signature = String(q.signature || '').toLowerCase();
  const status = parseInt(q.status, 10);
  const secret = process.env.OFFERWALL_SECRET;
  if (!secret || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY)
    return res.status(500).send('ERROR: not configured');

  // 1) Verify signature exactly as documented: md5(subId + transId + reward + secret)
  const expected = crypto.createHash('md5').update(subId + transId + reward + secret, 'utf8').digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(signature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
    return res.status(403).send("ERROR: Signature doesn't match");

  // 2) Validate fields (reward is signed; payout is not, so we never credit from it)
  const amount = Number(reward);
  if (!/^g_[0-9a-f]{24}$/.test(subId) || !transId || transId.length > 200 || !isFinite(amount) || amount < 0)
    return res.status(400).send('ERROR: bad fields');
  if (status !== 1 && status !== 2) return res.status(400).send('ERROR: bad status');

  try {
    if (status === 1) {
      const hold = Number(process.env.HOLD_DAYS || 3);
      const row = {
        trans_id: transId, sub_id: subId, reward: amount, status: 1,
        payout: Number(q.payout) || null, offer_type: String(q.offer_type || '').slice(0, 40),
        offer_name: String(q.offer_name || '').slice(0, 200), country: String(q.country || '').slice(0, 2),
        available_at: new Date(Date.now() + hold * 86400000).toISOString(),
      };
      // Duplicate transId is ignored, so a transaction can only credit once
      const r = await sb('transactions', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(row) });
      if (!r.ok) throw new Error('db ' + r.status);
    } else {
      // Reversal: mark existing as reversed, or record it so a later credit can't be added
      const u = await sb('transactions?trans_id=eq.' + encodeURIComponent(transId), { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ status: 2 }) });
      const rows = u.ok ? await u.json() : null;
      if (!u.ok) throw new Error('db ' + u.status);
      if (!rows.length) {
        const r = await sb('transactions', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ trans_id: transId, sub_id: subId, reward: amount, status: 2, available_at: new Date().toISOString() }) });
        if (!r.ok) throw new Error('db ' + r.status);
      }
    }
    return res.status(200).send('OK');
  } catch (e) {
    return res.status(500).send('ERROR: server');
  }
};
