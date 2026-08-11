exports.handler = async (event) => {
  // CORS 처리 (브라우저 요청 대응)
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
  const useGrounding = body.grounding === true; // 프론트엔드 요청에 따른 그라운딩 켜기 옵션
  const API_KEY = process.env.GEMINI_API_KEY;

  if (!API_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' })
    };
  }

  try {
    const requestPayload = {
      contents: [{ parts: [{ text: prompt }] }]
    };

    // Google 검색 그라운딩 활성화
    if (useGrounding) {
      requestPayload.tools = [{ google_search: {} }];
    }

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload)
      }
    );

    const data = await resp.json();
    const candidate = data?.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text || null;

    // 그라운딩 검색 출처 정보 추출
    let sources = [];
    if (candidate?.groundingMetadata?.groundingChunks) {
      sources = candidate.groundingMetadata.groundingChunks
        .map(chunk => chunk.web)
        .filter(web => web && web.uri)
        .map(web => ({ title: web.title || web.uri, url: web.uri }));
    }

    return {
      statusCode: resp.ok ? 200 : resp.status,
      headers,
      body: JSON.stringify({ text, sources, raw: data, error: data?.error?.message || null })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};