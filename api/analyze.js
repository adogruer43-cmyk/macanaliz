module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, prompt } = req.body || {};

  // ── REAL FIXTURES (football-data.org) ─────────────────
  if (type === 'fixtures') {
    const fdKey = process.env.FOOTBALLDATA_API_KEY;
    if (!fdKey) return res.status(500).json({ error: 'FOOTBALLDATA_API_KEY eksik' });

    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const nextWeek = new Date(now.getTime() + 7*24*60*60*1000).toISOString().split('T')[0];
      const comps = ['TR1','PL','PD','BL1','SA','CL'];

      const results = await Promise.allSettled(comps.map(comp =>
        fetch(`https://api.football-data.org/v4/competitions/${comp}/matches?dateFrom=${today}&dateTo=${nextWeek}`, {
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

  // ── ALLSPORTS: TODAY'S MATCHES WITH ODDS + FORM ───────
  if (type === 'allsports') {
    const asKey = process.env.ALLSPORTS_API_KEY;
    if (!asKey) return res.status(500).json({ error: 'ALLSPORTS_API_KEY eksik' });

    try {
      const now = new Date();
      // Get matches for next 7 days
      const results = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(now.getTime() + d*24*60*60*1000)
          .toISOString().split('T')[0].split('-').reverse().join('/'); // DD/MM/YYYY

        const r = await fetch(
          `https://apiv2.allsportsapi.com/football/?met=Fixtures&APIkey=${asKey}&from=${date}&to=${date}&leagueId=207,148,152,175,207,302`,
        ).then(r => r.json());

        if (r?.result) results.push(...r.result);
        if (results.length >= 15) break;
      }

      // Get odds for found matches
      const matchesWithOdds = await Promise.allSettled(
        results.slice(0, 12).map(async m => {
          try {
            const oddsR = await fetch(
              `https://apiv2.allsportsapi.com/football/?met=Odds&APIkey=${asKey}&matchId=${m.event_key}`
            ).then(r => r.json());
            const odds = oddsR?.result?.[0]?.odds || [];
            // Find 1X2 odds
            const oneX2 = odds.find(o => o.odd_name === '3Way Result' || o.odd_name === 'Match Winner');
            const homeOdd = oneX2?.values?.find(v => v.value === 'Home')?.odd || null;
            const drawOdd = oneX2?.values?.find(v => v.value === 'Draw')?.odd || null;
            const awayOdd = oneX2?.values?.find(v => v.value === 'Away')?.odd || null;
            // Find Over/Under 2.5
            const ou = odds.find(o => o.odd_name === 'Over/Under' || o.odd_name?.includes('2.5'));
            const overOdd = ou?.values?.find(v => v.value?.includes('Over'))?.odd || null;
            const underOdd = ou?.values?.find(v => v.value?.includes('Under'))?.odd || null;
            return { ...m, homeOdd, drawOdd, awayOdd, overOdd, underOdd };
          } catch {
            return m;
          }
        })
      );

      const final = matchesWithOdds
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value);

      return res.status(200).json({ matches: final });
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
