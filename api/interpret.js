// ===== 知时塔罗 — AI 解读 API (DeepSeek) =====
// Vercel Serverless Function

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    var body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    var spread = body.spread;
    var question = body.question;
    var cards = body.cards;

    if (!spread || !cards || !Array.isArray(cards) || cards.length === 0) {
      return res.status(400).json({ error: '缺少必要参数：spread, cards' });
    }

    var systemPrompt = buildSystemPrompt();
    var userPrompt = buildUserPrompt(spread, question, cards);

    var apiKey = process.env.DEEPSEEK_API_KEY;
    var baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';

    if (!apiKey) {
      console.error('DEEPSEEK_API_KEY not configured');
      return res.status(500).json({ error: 'AI 服务未配置，请联系管理员' });
    }

    var controller = new AbortController();
    var timeout = setTimeout(function() { controller.abort(); }, 28000);

    try {
      var response = await fetch(baseUrl + '/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.8,
          max_tokens: 4000
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!response.ok) {
        var errText = '';
        try { errText = await response.text(); } catch(e) {}
        console.error('DeepSeek API error:', response.status, errText.slice(0, 300));
        return res.status(502).json({ error: 'AI 服务暂时不可用（' + response.status + '），请稍后重试' });
      }

      var data = await response.json();
      var content = data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content
        : '';

      if (!content) {
        console.error('Empty response from DeepSeek');
        return res.status(502).json({ error: 'AI 返回了空结果，请重试' });
      }

      var parsed = parseAIResponse(content, cards);
      return res.status(200).json({ ok: true, ...parsed });

    } catch (fetchErr) {
      clearTimeout(timeout);
      if (fetchErr.name === 'AbortError') {
        return res.status(504).json({ error: 'AI 响应超时，请稍后重试' });
      }
      throw fetchErr;
    }

  } catch (e) {
    console.error('API error:', e.message);
    return res.status(500).json({ error: '服务异常: ' + e.message.slice(0, 200) });
  }
};

// ===== System Prompt =====
function buildSystemPrompt() {
  return '你是一位经验丰富的塔罗牌解读师，精通韦特塔罗体系。\n' +
    '\n' +
    '你的解读风格：\n' +
    '1. 将塔罗视为"人生策略顾问"，帮助提问者看清局势、理解内在动力、找到行动方向\n' +
    '2. 语言温暖有力量，使用流畅优美的中文，像一位智者朋友在倾谈\n' +
    '3. 避免绝对化的命运断言（"一定会..."），多用"可能""倾向于""建议考虑"\n' +
    '4. 每张牌都要结合其【牌位含义】（在牌阵中的具体位置）和【正逆位】来解读\n' +
    '5. 不拘泥于书本牌义——观察牌与牌之间的关系，给出有洞察力的串联分析\n' +
    '6. 给具体的、可执行的建议，而非空泛的安慰\n' +
    '\n' +
    '重要：你的回复必须使用以下JSON格式，不要在JSON前后添加任何其他文字或markdown代码块：\n' +
    '{\n' +
    '  "overall": "整体解读文字（300-500字），综合所有牌的信息，给出全局性的分析和洞察",\n' +
    '  "cards": [\n' +
    '    {"position": "阵位名称", "cardName": "牌名（含正/逆位）", "reading": "该牌在此位置的详细解读（150-300字），结合阵位含义和正逆位"}\n' +
    '  ],\n' +
    '  "advice": "行动建议（100-200字），具体的、可执行的指导",\n' +
    '  "reflection": ["反思问题1（引导提问者深入思考）", "反思问题2", "反思问题3"]\n' +
    '}';
}

// ===== User Prompt =====
function buildUserPrompt(spreadId, question, cards) {
  var spreadNames = {
    single: '单张指引',
    timeFlow: '时间之流（过去·现在·未来）',
    celticCross: '凯尔特十字'
  };
  var spreadName = spreadNames[spreadId] || spreadId;

  var cardsText = cards.map(function(c, i) {
    return '- 第' + (i + 1) + '张：[' + c.position + '] ' + c.cardName + '（' + c.cardNameEn + '） — ' + (c.reversed ? '逆位' : '正位');
  }).join('\n');

  return '【牌阵】' + spreadName + '\n' +
    '【提问者的问题】' + (question || '未指定具体问题') + '\n' +
    '【抽牌结果】\n' + cardsText + '\n' +
    '\n' +
    '请综合以上信息，给出完整的塔罗解读。记住：\n' +
    '- 每张牌都要结合它在牌阵中的位置来解读\n' +
    '- 正位和逆位的含义有所不同，请据此调整解读方向\n' +
    '- 把各张牌的解读串联成一个有逻辑的整体\n' +
    '- 给出提问者真正能用的建议，而不是泛泛而谈';
}

// ===== 解析 AI 响应 =====
function parseAIResponse(content, cards) {
  // 尝试直接解析
  try {
    var parsed = JSON.parse(content.trim());
    return validateAndFix(parsed, cards);
  } catch(e) {}

  // 尝试提取 JSON（处理 markdown 代码块包裹的情况）
  var jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      var parsed2 = JSON.parse(jsonMatch[0]);
      return validateAndFix(parsed2, cards);
    } catch(e2) {}
  }

  // 解析失败，返回原始文本作为整体解读
  return {
    overall: content,
    cards: cards.map(function(c) {
      return {
        position: c.position,
        cardName: c.cardName + (c.reversed ? '（逆位）' : '（正位）'),
        reading: c.meaning || ''
      };
    }),
    advice: '请根据塔罗牌的指引，结合自己的实际情况做出判断。',
    reflection: ['这张牌让你想到了什么？', '你目前的处境中，什么是最需要你关注的？', '如果没有任何限制，你会怎么做？']
  };
}

function validateAndFix(parsed, cards) {
  return {
    overall: parsed.overall || '',
    cards: Array.isArray(parsed.cards) ? parsed.cards.map(function(c, i) {
      return {
        position: c.position || (cards[i] ? cards[i].position : ''),
        cardName: c.cardName || (cards[i] ? cards[i].cardName : ''),
        reading: c.reading || ''
      };
    }) : cards.map(function(c) {
      return { position: c.position, cardName: c.cardName, reading: c.meaning || '' };
    }),
    advice: parsed.advice || '',
    reflection: Array.isArray(parsed.reflection) && parsed.reflection.length > 0
      ? parsed.reflection.slice(0, 5)
      : ['你从这次占卜中获得了什么启示？', '接下来你最想做的一个改变是什么？']
  };
}
