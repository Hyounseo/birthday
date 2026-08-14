exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    body = {};
  }

  const prompt = body.prompt || '';
  // 💡 API 키 복사 시 생길 수 있는 앞뒤 공백(trim) 안전 처리
  const API_KEY = process.env.GROQ_API_KEY ? process.env.GROQ_API_KEY.trim() : null;

  if (!API_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'GROQ_API_KEY가 설정되지 않았습니다.' })
    };
  }

  // 무료 할당량 넉넉하고 한국어 성능이 뛰어난 모델 순서대로 폴백 체인
  const MODEL_FALLBACK_CHAIN = [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant'
  ];

  async function callGroq(model) {
    try {
      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.8
        })
      });
      const data = await resp.json().catch(() => ({}));
      return { resp, data };
    } catch (e) {
      return { resp: { ok: false, status: 500 }, data: { error: { message: e.message } } };
    }
  }

  try {
    let lastResult = null;

    for (const model of MODEL_FALLBACK_CHAIN) {
      const { resp, data } = await callGroq(model);
      lastResult = { resp, data, model };

      if (resp && resp.ok && data?.choices?.[0]?.message?.content) {
        const text = data.choices[0].message.content;
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ text, sources: [], raw: data, error: null, modelUsed: model })
        };
      }
    }

    return {
      statusCode: lastResult?.resp?.status || 500,
      headers,
      body: JSON.stringify({
        text: null,
        sources: [],
        raw: lastResult?.data || null,
        error: lastResult?.data?.error?.message || '모든 Groq 모델에서 응답을 받지 못했습니다.',
        modelUsed: lastResult?.model || null
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};