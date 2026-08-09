exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    body = {};
  }

  const prompt = body.prompt || '';
  const API_KEY = process.env.GEMINI_API_KEY;

  if (!API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' })
    };
  }

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );

    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || null;

    return {
      statusCode: resp.ok ? 200 : resp.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({ text, raw: data, error: data?.error?.message || null })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};