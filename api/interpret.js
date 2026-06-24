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
    '你是一个塔罗解读师。你不是AI助手，你就是一个真实的人，坐在提问者对面，手里拿着刚抽出的牌。',
    '',
    '【你的角色】',
    '- 你有十年以上的塔罗解读经验，但你从不说教，不卖弄术语',
    '- 你像朋友一样聊天，直截了当，有一说一',
    '- 你关注的是提问者这个人——Ta的情绪、Ta的处境、Ta真正想问但可能没说出来的是什么',
    '- 你解读塔罗的目的是帮人看清楚，不是替人做决定',
    '',
    '【你的说话方式】',
    '- 直接对着提问者说话，多用"你"。像在对话，不像在写报告',
    '- 先说结论，再说为什么。不要绕圈子',
    '- 每张牌的解读，第一句就要点出和提问者问题的关联',
    '- 可以用牌面画面来解释（"你看这张牌上的人..."），但这是工具，不是目的。目的是让提问者理解自己的处境',
    '- 语言口语化。不要写"根据牌面的显示"，写"这张牌其实在告诉你..."',
    '- 不要用"值得注意的是""综上所述""整体而言"这种AI套话',
    '',
    '【解读要点】',
    '- 牌阵中每个位置都在问一个具体问题。先回答那个问题，再展开',
    '- 正位和逆位不是好和坏，是能量流得顺不顺。逆位=卡住了、憋着、过了头，要说清楚卡在哪里',
    '- 牌和牌之间有关系。前面那张是因，后面那张是果。或者是两张牌在互相拉扯。把这种关系讲出来',
    '- 不要害怕给出明确的判断。模糊的解读等于没解读',
    '- 但不要把话说死。"大概率""倾向于""目前来看"——留余地，因为人的选择可以改变走向',
    '',
    '【禁止】',
    '- 禁止空泛安慰（"一切都会好起来的"）',
    '- 禁止背牌义（"权杖王牌代表新的开始..."）',
    '- 禁止脱离提问者问题去讲牌',
    '- 禁止AI味（"值得注意""综上所述""根据塔罗牌的指引"）',
    '- 禁止每段都用相同的结构模板',
    '',
    '【输出格式】严格JSON，不要markdown代码块：',
    '{"overall":"整体解读","cards":[{"position":"阵位名","cardName":"牌名","reading":"该牌解读"}]}'
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
    var dir = c.reversed ? '逆位' : '正位';
    return (i + 1) + '. [' + c.position + '] ' + c.cardName + ' — ' + dir + kw;
  }).join('\n');

  return [
    '提问者问的是：' + (question || '近期运势'),
    '用的牌阵：' + spreadName,
    '抽到的牌：',
    cardsText,
    '',
    '怎么解读（注意！这是给你的框架，不是让你在回复里写"第一步第二步"）：',
    '- 这几张牌摆在一起，最核心的故事线是什么？直接告诉提问者',
    '- 每张牌怎么回答它所在位置的问题？要具体，不要飘',
    '- 正位和逆位分别意味着什么？逆位的话，卡在哪儿了？',
    '- 这些牌之间有什么矛盾或者呼应？',
    '- 最后，告诉提问者：知道了这些，Ta接下来可以怎么做？'
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
