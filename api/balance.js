// Returns verified balance for a guest ID. Env: SUPABASE_URL, SUPABASE_SERVICE_KEY
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const uid = String((req.query && req.query.uid) || '');
  if (!/^g_[0-9a-f]{24}$/.test(uid)) return res.status(400).json({ error: 'bad_user_id' });
  try {
    const r = await fetch(process.env.SUPABASE_URL + '/rest/v1/transactions?select=reward,available_at&status=eq.1&sub_id=eq.' + uid, {
      headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_KEY },
    });
    if (!r.ok) throw new Error();
    const rows = await r.json(), now = Date.now();
    let available = 0, pending = 0;
    rows.forEach(t => { (new Date(t.available_at).getTime() <= now ? (available += Number(t.reward)) : (pending += Number(t.reward))); });
    res.status(200).json({ available, pending });
  } catch (e) { res.status(500).json({ error: 'server' }); }
};
