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
  return [
    '你是一位资深塔罗解读师，精通韦特-史密斯（Rider-Waite-Smith）塔罗体系。',
    '',
    '【核心原则】',
    '1. 塔罗是"人生策略顾问"，揭示内在动力与可能趋势，而非宿命预言',
    '2. 每张RWS牌都有丰富的画面符号（人物姿态、颜色、背景、道具），你的解读必须引用具体画面元素作为依据',
    '3. 正位表示能量顺畅流动，逆位表示能量受阻/内化/过度——必须明确区分',
    '4. 牌与牌之间存在对话关系（互相加强/矛盾/递进/因果），这是解读的灵魂',
    '',
    '【解读结构（必须遵守）】',
    '整体解读：',
    '- 开篇点出牌阵中最核心的1-2张牌及其画面',
    '- 分析牌之间的整体叙事线索（例如：从挣扎→释放→新生的故事线）',
    '- 将牌面叙事与提问者的问题明确挂钩',
    '- 结尾给出1个最关键的洞察',
    '',
    '逐张解读：',
    '- 先描述该牌RWS画面中1-2个关键元素（如"逆位权杖十中背负沉重木柴的人"）',
    '- 再结合该牌在牌阵中的位置含义进行解读',
    '- 最后指出该牌与前后牌的关系（如"这张星币四的固守，恰好被下一张死神所打破"）',
    '- 正位和逆位必须有截然不同的解读方向，不可混用',
    '',
    '【禁止事项】',
    '- 禁止泛泛而谈（如"这段时间你会遇到一些挑战"——什么挑战？从哪张牌看出来的？）',
    '- 禁止绝对化断言（"你一定会成功"→ 应说"牌面显示你有成功的潜力，前提是..."）',
    '- 禁止脱离牌面画面空谈（每段解读至少引用1个具体画面元素）',
    '- 禁止只罗列牌义而不做串联分析',
    '- 禁止使用"根据塔罗牌的指示"等套话',
    '',
    '【语言风格】',
    '- 精准、有洞察力，像智者点醒而非泛泛安慰',
    '- 用画面驱动解读（"权杖八中飞翔的八根权杖告诉你，消息正在路上"）',
    '- 中文流畅自然，避免翻译腔',
    '',
    '【输出格式】严格JSON，不要markdown代码块：',
    '{"overall":"整体解读(300-500字)","cards":[{"position":"阵位名","cardName":"牌名(正/逆位)","reading":"该牌解读(150-300字)"}]}'
  ].join('\n');
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
    var kw = (c.keywords && c.keywords.length) ? ' | 关键词：' + c.keywords.join('、') : '';
    var dir = c.reversed ? '逆位（能量受阻/内化/过度）' : '正位（能量顺畅流动）';
    return (i + 1) + '. [' + c.position + '] ' + c.cardName + ' — ' + dir + kw;
  }).join('\n');

  return [
    '【牌阵】' + spreadName,
    '【提问者的问题】' + (question || '请做通用运势解读'),
    '【抽牌结果】',
    cardsText,
    '',
    '请按以下框架解读：',
    '1. 看画面：每张牌的RWS画面元素透露了什么信息？',
    '2. 看位置：该牌在牌阵中的位置含义是什么？画面+位置结合产生了什么洞察？',
    '3. 看关系：牌与牌之间如何对话？哪些牌互相加强？哪些牌形成张力？',
    '4. 看故事：从第一张到最后一张，牌面讲述了一个怎样的叙事弧线？',
    '5. 回应提问者：以上所有分析，如何具体回答提问者的问题？'
  ].join('\n');
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
