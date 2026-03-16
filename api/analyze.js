module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, prompt } = req.body || {};

  // ── REAL FIXTURES ─────────────────────────────────────
  if (type === 'fixtures') {
    const fdKey = process.env.FOOTBALLDATA_API_KEY;
    if (!fdKey) return res.status(500).json({ error: 'FOOTBALLDATA_API_KEY eksik' });

    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const nextWeek = new Date(now.getTime() + 7*24*60*60*1000).toISOString().split('T')[0];

      const comps = ['TR1','PL','PD','BL1','SA','CL'];
      const results = await Promise.allSettled(comps.map(comp =>
        fetch(`https://api.football-data.org/v4/competitions/${comp}/matches?dateFrom=${today}&dateTo=${nextWeek}&status=SCHEDULED,TIMED,IN_PLAY,PAUSED,FINISHED`, {
          headers: { 'X-Auth-Token': fdKey }
        }).then(r => r.json())
      ));

      const allMatches = results
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => r.value?.matches || [])
        .slice(0, 15);

      return res.status(200).json({ matches: allMatches });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── AI ANALYSIS ───────────────────────────────────────
  if (!prompt) return res.status(400).json({ error: 'prompt eksik' });
  const aiKey = process.env.OPENROUTER_API_KEY;
  if (!aiKey) return res.status(500).json({ error: 'OPENROUTER_API_KEY eksik' });

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + aiKey,
        'HTTP-Referer': 'https://macanaliz.vercel.app',
        'X-Title': 'MacAnaliz'
      },
      body: JSON.stringify({
        model: 'openrouter/auto',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 6000
      })
    });

    const rawText = await response.text();
    if (!response.ok) return res.status(500).json({ error: 'OpenRouter hatası: ' + rawText.slice(0,300) });

    let data;
    try { data = JSON.parse(rawText); }
    catch(e) { return res.status(500).json({ error: 'Geçersiz yanıt: ' + rawText.slice(0,200) }); }

    const text = data?.choices?.[0]?.message?.content || '';
    if (!text) return res.status(500).json({ error: 'Boş yanıt.' });
    return res.status(200).json({ text });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
