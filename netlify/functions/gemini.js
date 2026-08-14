exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { body = {}; }

  const mode = body.mode || 'message'; // 'gift' 또는 'message'
  let userPrompt = body.prompt || '';
  const candidates = body.candidates || [];
  const tone = body.tone || 'plain';
  const API_KEY = process.env.GROQ_API_KEY ? process.env.GROQ_API_KEY.trim() : null;

  // 🔒 톤별 이모지 상한선 강제 제어
  const EMOJI_LIMIT = { plain: 0, cute: 2, funny: 2, touching: 1 };

  function enforceEmojiLimit(text, limit) {
    if (!text) return text;
    const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu;
    let count = 0;
    let cleaned = text.replace(emojiRegex, (match) => {
      count++;
      return count <= limit ? match : '';
    });
    cleaned = cleaned.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    return cleaned;
  }

  if (!API_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'GROQ_API_KEY 환경변수가 설정되지 않았습니다.' })
    };
  }

  // 🎁 선물 추천 전용 시스템 지침
  const GIFT_SYSTEM = `당신은 대한민국 전 연령대 맞춤 생일 선물 큐레이터 AI입니다.
반드시 제공된 [후보 상품 목록] 중에서만 골라야 합니다.
[절대 규칙]
1. name, price, icon은 후보 목록에 있는 값을 절대 바꾸지 말고 그대로 사용하세요. 후보 목록에 없는 상품을 만들어내는 것은 엄격히 금지됩니다.
2. 반드시 후보 목록에 있는 상품 중에서만 3개를 선택하세요.
3. desc(추천 이유)만 받는 분의 상황에 맞게 센스 있고 매력적인 한 줄로 새로 작성하세요.
4. 부가 설명 없이 반드시 순수 JSON 배열 포맷만 출력하세요:
[{"name":"후보 목록의 상품명 그대로","price":후보 목록의 가격 그대로,"icon":"후보 목록의 아이콘 그대로","desc":"추천 이유"}]`;

  // 💌 축하 멘트 전용 시스템 지침
  const MESSAGE_SYSTEM = `당신은 센스 있는 한국어 생일 축하 메시지 작가입니다.

[절대 금지사항]
- "당신의 특별한 날", "기도합니다", "화려한 길" 같은 어색한 번역투 표현 절대 금지.
- 사용자의 지시문이나 키워드를 따옴표 없이 어색하게 통째로 복사해서 넣지 말고 문맥에 자연스럽게 녹여낼 것.
- '담백하게' 톤일 때는 이모티콘을 절대 하나도 쓰지 마세요.
- '진중하게' 톤일 때는 이모티콘을 최대 1개까지만 쓰세요.
- '귀엽게' 톤일 때는 이모티콘을 2개 이내로 쓰세요.
- '유쾌하게' 톤일 때는 이모티콘을 1~2개 이내로 쓰세요.
- 지정된 분량(문장 수)을 반드시 지키세요. 짧게 요청받았는데 길게 쓰거나, 길게 요청받았는데 짧게 쓰지 마세요.
- 한자, 일본어, 외국어 사용 금지.

사용자가 요청한 관계, 말투, 톤앤매너, 분량 조건을 엄격히 준수하여 자연스러운 카카오톡 완성문만 단답형으로 출력하세요.`;

  const SYSTEM_INSTRUCTION = mode === 'gift' ? GIFT_SYSTEM : MESSAGE_SYSTEM;

  if (mode === 'gift' && candidates.length > 0) {
    userPrompt += `\n\n[후보 상품 목록]\n${JSON.stringify(candidates)}\n\n위 후보 목록 안에서만 가장 어울리는 상품 3개를 선정해 지정된 JSON 배열로만 출력하세요.`;
  }

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
        temperature: mode === 'gift' ? 0.1 : 0.5,
        max_tokens: 800
      })
    });

    const data = await resp.json();

    if (!resp.ok) {
      return {
        statusCode: resp.status,
        headers,
        body: JSON.stringify({ error: data?.error?.message || 'Groq API 오류 발생', raw: data })
      };
    }

    let text = data?.choices?.[0]?.message?.content || null;
    if (text && mode === 'message') {
      text = text.replace(/^["']|["']$/g, '').trim();
      const limit = EMOJI_LIMIT[tone] !== undefined ? EMOJI_LIMIT[tone] : 2;
      text = enforceEmojiLimit(text, limit);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ text, raw: data, error: null })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};