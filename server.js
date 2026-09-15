const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 8000;
const ROOT = __dirname;

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function serveFile(res, relativePath) {
  const safePath = relativePath === '/' ? 'index.html' : relativePath.replace(/^\/+/, '');
  const targetPath = path.join(ROOT, safePath);

  fs.readFile(targetPath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(targetPath).toLowerCase();
    const typeMap = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.ico': 'image/x-icon'
    };

    res.writeHead(200, { 'Content-Type': typeMap[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/refresh-forecast') {
    const child = spawn(process.execPath, ['Scripts/main.js'], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        sendJson(res, 200, {
          ok: true,
          message: 'Forecast refreshed successfully',
          stdout
        });
        return;
      }

      sendJson(res, 500, {
        ok: false,
        message: 'Failed to refresh forecast',
        stderr
      });
    });

    return;
  }

  serveFile(res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`Serveur ProTrek actif sur http://localhost:${PORT}`);
});
