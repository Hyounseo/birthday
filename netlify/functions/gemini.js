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

  const userPrompt = body.prompt || '';
  const API_KEY = process.env.GROQ_API_KEY ? process.env.GROQ_API_KEY.trim() : null;

  if (!API_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'GROQ_API_KEY가 설정되지 않았습니다.' })
    };
  }

  // 💡 Groq(Llama 3.3 70B)의 환각을 완벽히 잡는 엄격한 한국어 페르소나 시스템 지침
  const SYSTEM_INSTRUCTION = `당신은 대한민국 20대 트렌드와 카카오톡 선물하기에 가장 정통한 '생일 플래너 AI'입니다.

[절대 규칙]
1. 언어: 100% 완벽한 현대 한국어만 사용하세요. 한자(漢字), 일본어(가나), 베트남어, 어색한 번역투는 단 한 글자도 절대 출력하지 마세요.
2. 선물 추천 요청 시:
   - 가짜 제품명 지어내기 금지. 올리브영, 백화점, 카카오톡 선물하기에 실존하는 한국 20대 인기 브랜드(샤넬, 디올, 입생로랑, 탬버린즈, 이솝, 딥티크, 논픽션, 소니, 마샬, 에어팟, 메종키츠네, 아크네 등)만 추천하세요.
   - 아이콘(icon): 단순 상자(🎁)만 쓰지 말고, 상품 종류에 맞는 구체적인 이모지(립스틱/틴트: 💄/💋, 향수/핸드크림: 🧴/🌸, 헤드폰/스피커: 🎧/🔊, 전자기기: 📱/⚡, 가방/지갑: 👜/👛, 머플러/패션: 🧣/🧢)를 반드시 매칭하세요.
   - 가격(price): 사용자가 설정한 희망 예산에 최대한 가깝게 맞추세요. (예산이 20만원대인데 1~3만원대를 추천하는 행위 엄격 금지)
   - 반드시 JSON 배열 포맷만 출력하세요: [{"name":"실제브랜드 상품명","price":숫자,"icon":"이모지","desc":"추천 이유 한 줄"}]
3. 축하 멘트 요청 시:
   - 진부한 번역투("당신의 꿈과 희망이...") 절대 금지.
   - 20대가 실제로 카톡이나 인스타 스토리에 쓰는 감각적이고 센스 있는 자연스러운 말투(이모티콘 적절히 활용, 찰진 맞춤법)로 작성하세요.`;

  try {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: SYSTEM_INSTRUCTION },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.4, // 헛소리/외국어 방지를 위해 온도를 최적화
        max_tokens: 1000
      })
    });

    const data = await resp.json();

    if (!resp.ok) {
      return {
        statusCode: resp.status,
        headers,
        body: JSON.stringify({ error: data?.error?.message || 'Groq API 오류', raw: data })
      };
    }

    let text = data?.choices?.[0]?.message?.content || null;

    // 혹시 모를 한자나 외국어 문자열 정제 필터링
    if (text) {
      text = text.replace(/[\u4e00-\u9fa5\u3040-\u30ff]/g, ''); // 한자 및 일본어 제거
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ text, sources: [], raw: data, error: null })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};