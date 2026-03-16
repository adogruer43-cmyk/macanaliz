module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
 
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
 
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY bulunamadı.' });
  }
 
  const { prompt } = req.body || {};
  if (!prompt) {
    return res.status(400).json({ error: 'prompt eksik' });
  }
 
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'HTTP-Referer': 'https://macanaliz.vercel.app',
        'X-Title': 'MacAnaliz'
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-3.3-8b-instruct:free',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 8000
      })
    });
 
    const data = await response.json();
 
    if (!response.ok) {
      const errMsg = data?.error?.message || JSON.stringify(data);
      return res.status(500).json({ error: 'OpenRouter hatası: ' + errMsg });
    }
 
    const text = data?.choices?.[0]?.message?.content || '';
    if (!text) return res.status(500).json({ error: 'Boş yanıt döndü.' });
 
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: e.message });
