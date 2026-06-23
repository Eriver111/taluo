// ===== 知时塔罗 — 本地开发服务器 =====
// 用法: node dev-server.js
// 静态文件服务 + /api/interpret 路由

var http = require('http');
var fs = require('fs');
var path = require('path');

// 加载 .env
try {
  var envContent = fs.readFileSync('.env', 'utf8');
  envContent.split('\n').forEach(function(line) {
    line = line.trim();
    if (line && line[0] !== '#') {
      var idx = line.indexOf('=');
      if (idx > 0) {
        process.env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
    }
  });
} catch(e) {}

var PORT = process.env.PORT || 3004;

var MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function serveStatic(req, res) {
  var urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  var filePath = path.join(__dirname, urlPath);

  // 安全检查：防止目录遍历
  var resolved = path.resolve(filePath);
  if (resolved.indexOf(__dirname) !== 0) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  var ext = path.extname(filePath);
  var contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, function(err, data) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404</h1>');
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });
    res.end(data);
  });
}

function handleAPI(req, res) {
  // 收集请求体
  var body = '';
  req.on('data', function(chunk) { body += chunk; });
  req.on('end', function() {
    // 动态加载 API handler
    var apiPath = path.join(__dirname, 'api', 'interpret.js');
    delete require.cache[require.resolve(apiPath)];
    try {
      var handler = require(apiPath);
      // 模拟 Vercel serverless 的 req/res
      var mockReq = {
        method: req.method,
        headers: req.headers,
        body: body
      };
      var mockRes = {
        status: function(code) {
          this.statusCode = code;
          return this;
        },
        json: function(data) {
          res.writeHead(this.statusCode || 200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(JSON.stringify(data));
        },
        end: function(data) {
          res.writeHead(this.statusCode || 200, {
            'Content-Type': 'text/plain',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(data || '');
        },
        setHeader: function(k, v) {
          if (!this._headers) this._headers = {};
          this._headers[k] = v;
        }
      };
      handler(mockReq, mockRes);
    } catch(e) {
      console.error('API Error:', e.message);
      res.writeHead(500, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({ error: 'Internal Server Error' }));
    }
  });
}

var server = http.createServer(function(req, res) {
  console.log(req.method, req.url);

  if (req.method === 'OPTIONS') {
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end();
    return;
  }

  if (req.url.startsWith('/api/')) {
    handleAPI(req, res);
  } else {
    serveStatic(req, res);
  }
});

server.listen(PORT, function() {
  console.log('🔮 知时塔罗 开发服务器已启动');
  console.log('   地址: http://localhost:' + PORT);
  console.log('   API:  http://localhost:' + PORT + '/api/interpret');
  if (!process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY === 'sk-your-deepseek-api-key') {
    console.log('   ⚠️  未配置 DEEPSEEK_API_KEY，AI解读将使用静态牌义兜底');
  } else {
    console.log('   ✅ DEEPSEEK_API_KEY 已配置');
  }
});
