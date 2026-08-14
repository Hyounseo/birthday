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

  const requestPayload = {
    contents: [{ parts: [{ text: prompt }] }]
  };

  // Google 검색 그라운딩 활성화
  if (useGrounding) {
    requestPayload.tools = [{ google_search: {} }];
  }

  // 무료 할당량이 가장 넉넉한 순서대로 시도 (1순위 실패/과부하 시 2, 3순위로 자동 전환)
  const MODEL_FALLBACK_CHAIN = [
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-flash-latest'
  ];

  const MAX_RETRIES_PER_MODEL = 2; // 503(서버 과부하) 시 모델당 재시도 횟수
  const RETRY_DELAY_MS = 1200;     // 재시도 간격 (점점 늘어남)

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function callGemini(model) {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload)
      }
    );
    const data = await resp.json().catch(() => ({}));
    return { resp, data };
  }

  let lastResult = null;

  try {
    for (const model of MODEL_FALLBACK_CHAIN) {
      let attempt = 0;

      while (attempt <= MAX_RETRIES_PER_MODEL) {
        const { resp, data } = await callGemini(model);
        lastResult = { resp, data, model };

        // 성공하면 바로 반환
        if (resp.ok && data?.candidates?.[0]) {
          const candidate = data.candidates[0];
          const text = candidate?.content?.parts?.[0]?.text || null;

          let sources = [];
          if (candidate?.groundingMetadata?.groundingChunks) {
            sources = candidate.groundingMetadata.groundingChunks
              .map((chunk) => chunk.web)
              .filter((web) => web && web.uri)
              .map((web) => ({ title: web.title || web.uri, url: web.uri }));
          }

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ text, sources, raw: data, error: null, modelUsed: model })
          };
        }

        const errStatus = data?.error?.status;
        const errCode = data?.error?.code || resp.status;

        // 503(서버 과부하) → 같은 모델로 잠깐 대기 후 재시도
        if (errStatus === 'UNAVAILABLE' || errCode === 503) {
          attempt++;
          if (attempt <= MAX_RETRIES_PER_MODEL) {
            await sleep(RETRY_DELAY_MS * attempt);
            continue;
          }
          break; // 재시도 소진 → 다음 모델로 넘어감
        }

        // 429(할당량 초과) 또는 404(모델 없음) → 재시도 없이 바로 다음 모델로 넘어감
        if (errStatus === 'RESOURCE_EXHAUSTED' || errCode === 429 || errCode === 404) {
          break;
        }

        // 그 외 에러(500 등)는 그대로 반환
        return {
          statusCode: errCode || 500,
          headers,
          body: JSON.stringify({
            text: null,
            sources: [],
            raw: data,
            error: data?.error?.message || `알 수 없는 오류 (모델: ${model})`,
            modelUsed: model
          })
        };
      }
      // while 루프 끝 → 다음 모델(model)로 이동
    }

    // 모든 모델/재시도를 다 써도 실패한 경우
    return {
      statusCode: lastResult?.resp?.status || 500,
      headers,
      body: JSON.stringify({
        text: null,
        sources: [],
        raw: lastResult?.data || null,
        error: lastResult?.data?.error?.message || '모든 모델에서 응답을 받지 못했습니다.',
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