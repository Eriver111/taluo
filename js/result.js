// ===== 知时塔罗 — 结果页逻辑 =====

(function() {
  // 粒子背景
  MoXingHe.start('mxhCanvas');

  // 解析 URL 参数
  var params = new URLSearchParams(window.location.search);
  var spreadId = params.get('spread') || 'timeFlow';
  var question = params.get('question') || '';
  var cardsParam = params.get('cards') || '';

  var spread = getSpreadById(spreadId);
  var cards = parseCardsFromURL(cardsParam);

  // 标记每张牌的位置
  cards.forEach(function(card, i) {
    card.position = spread.positions[i] ? spread.positions[i].label : '位置' + (i+1);
  });

  // 渲染头部
  document.getElementById('spreadNameDisplay').textContent = spread.name;
  document.getElementById('questionDisplay').textContent = question || '未指定问题';

  // 渲染卡牌展示条（带真实RWS牌面图）
  var cardStrip = document.getElementById('cardStrip');
  cards.forEach(function(card) {
    var el = document.createElement('div');
    el.className = 'card-mini' + (card.reversed ? ' reversed-mini' : '');
    el.innerHTML =
      '<img class="mini-img" src="assets/cards/' + card.cardId + '.jpg" alt="' + card.cardName + '" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'block\';">' +
      '<div class="mini-icon" style="display:none;">' + getCardIcon(card) + '</div>' +
      '<div class="mini-name">' + card.cardName + '</div>' +
      '<div class="mini-pos">' + card.position + '</div>' +
      (card.reversed ? '<div class="mini-reversed">逆位</div>' : '');
    cardStrip.appendChild(el);
  });

  // 构建牌面数据供 AI 使用
  var cardsForAI = cards.map(function(card) {
    return {
      position: card.position,
      cardName: card.cardName + (card.reversed ? '（逆位）' : '（正位）'),
      cardNameEn: card.cardNameEn || '',
      reversed: card.reversed,
      keywords: card.keywords || []
    };
  });

  // 调用 AI
  callAI(spreadId, question, cardsForAI);

  // ===== AI 调用 =====
  function callAI(spreadId, question, cardsForAI) {
    var aiLoading = document.getElementById('aiLoading');
    var aiReading = document.getElementById('aiReading');
    var aiError = document.getElementById('aiError');

    fetch('/api/interpret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spread: spreadId,
        question: question,
        cards: cardsForAI
      })
    })
    .then(function(res) {
      if (!res.ok) {
        return res.json().then(function(err) {
          throw new Error(err.error || 'HTTP ' + res.status);
        });
      }
      return res.json();
    })
    .then(function(data) {
      if (!data.ok) {
        throw new Error(data.error || '未知错误');
      }
      renderAIResponse(data);
    })
    .catch(function(err) {
      console.error('AI call failed:', err.message);
      aiLoading.style.display = 'none';
      aiError.style.display = 'block';
      document.getElementById('errorMsg').textContent = 'AI 解读暂时不可用：' + err.message;
      // 自动显示静态牌义
      showFallbackContent();
    });
  }

  // ===== 渲染 AI 响应 =====
  function renderAIResponse(data) {
    document.getElementById('aiLoading').style.display = 'none';
    document.getElementById('aiReading').style.display = 'block';
    document.getElementById('shareSection').style.display = 'block';

    // 整体解读
    document.getElementById('overallText').textContent = data.overall || '';

    // 逐张解读
    var cardReadings = document.getElementById('cardReadings');
    var cardData = data.cards || [];
    cardData.forEach(function(aiCard, i) {
      var drawer = document.createElement('div');
      drawer.className = 'section-drawer drawer-open';
      drawer.innerHTML =
        '<div class="drawer-toggle" onclick="toggleDrawer(\'cardReading' + i + '\')">' +
          '<span class="drawer-arrow">▸</span>' +
          '<h3>' + getCardEmoji(i) + ' ' + (aiCard.position || cards[i].position) + ' — ' + (aiCard.cardName || cards[i].cardName) + '</h3>' +
        '</div>' +
        '<div class="drawer-body">' +
          '<div class="drawer-content">' +
            '<div class="card-reading-text">' + (aiCard.reading || cards[i].meaning || '') + '</div>' +
          '</div>' +
        '</div>';
      cardReadings.appendChild(drawer);
    });

  }

  // ===== 静态牌义兜底 =====
  window.showFallbackContent = function() {
    document.getElementById('aiLoading').style.display = 'none';
    document.getElementById('aiReading').style.display = 'block';
    document.getElementById('shareSection').style.display = 'block';
    document.getElementById('aiError').style.display = 'none';

    // 整体解读（基于每张牌的 meaning 拼接）
    var overallParts = cards.map(function(card) {
      return '【' + card.position + '】' + card.cardName + (card.reversed ? '（逆位）' : '（正位）') + '：' + (card.meaning || '');
    });
    document.getElementById('overallText').textContent = '以下为各牌位的牌义参考。由于 AI 服务暂时不可用，我们为您呈现每张牌的传统释义。\n\n' + overallParts.join('\n\n');

    // 逐张解读
    var cardReadings = document.getElementById('cardReadings');
    cardReadings.innerHTML = '';
    cards.forEach(function(card, i) {
      var drawer = document.createElement('div');
      drawer.className = 'section-drawer drawer-open';
      drawer.innerHTML =
        '<div class="drawer-toggle" onclick="toggleDrawer(\'cardReading' + i + '\')">' +
          '<span class="drawer-arrow">▸</span>' +
          '<h3>' + getCardEmoji(i) + ' ' + card.position + ' — ' + card.cardName + (card.reversed ? '（逆位）' : '（正位）') + '</h3>' +
        '</div>' +
        '<div class="drawer-body">' +
          '<div class="drawer-content">' +
            '<div class="card-reading-section">' +
              '<p class="card-reading-title">💕 感情</p>' +
              '<p class="card-reading-text">' + (card.love || '') + '</p>' +
            '</div>' +
            '<div class="card-reading-section">' +
              '<p class="card-reading-title">💼 事业</p>' +
              '<p class="card-reading-text">' + (card.career || '') + '</p>' +
            '</div>' +
            '<div class="card-reading-section">' +
              '<p class="card-reading-title">💰 财运</p>' +
              '<p class="card-reading-text">' + (card.finance || '') + '</p>' +
            '</div>' +
            '<div class="card-reading-section">' +
              '<p class="card-reading-title">🌟 建议</p>' +
              '<p class="card-reading-text">' + (card.advice || '') + '</p>' +
            '</div>' +
          '</div>' +
        '</div>';
      cardReadings.appendChild(drawer);
    });

  };

  // ===== 工具函数 =====
  function getCardIcon(card) {
    if (card.arcana === 'major') {
      var icons = { '愚者':'🌅', '魔术师':'🪄', '女祭司':'🌙', '女皇':'👑', '皇帝':'🏰', '教皇':'📜', '恋人':'💕', '战车':'⚔️', '力量':'🦁', '隐者':'🕯️', '命运之轮':'🎡', '正义':'⚖️', '倒吊人':'🙃', '死神':'💀', '节制':'🌈', '恶魔':'😈', '高塔':'⚡', '星星':'⭐', '月亮':'🌙', '太阳':'☀️', '审判':'📯', '世界':'🌍' };
      return icons[card.cardName] || '🔮';
    }
    var suitIcons = { wands:'🔥', cups:'💧', swords:'💨', pentacles:'🌿' };
    return suitIcons[card.suit] || '🃏';
  }

  function getCardEmoji(i) {
    var emojis = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩'];
    return emojis[i] || (i+1);
  }

  // ===== 分享 =====
  window.copyShareLink = function() {
    var url = window.location.href;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function() {
        alert('链接已复制到剪贴板！');
      });
    } else {
      var ta = document.createElement('textarea');
      ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      alert('链接已复制到剪贴板！');
    }
  };

  // ===== 抽屉切换 =====
  window.toggleDrawer = function(sectionId) {
    // 查找包含该 onclick 的 section-drawer
    var drawers = document.querySelectorAll('.section-drawer');
    for (var i = 0; i < drawers.length; i++) {
      var toggle = drawers[i].querySelector('.drawer-toggle');
      if (toggle && toggle.getAttribute('onclick').indexOf(sectionId) !== -1) {
        drawers[i].classList.toggle('drawer-open');
        return;
      }
    }
  };
})();
