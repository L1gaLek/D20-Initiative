const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 5173);

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.cur': 'image/x-icon',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webm': 'video/webm',
  '.webp': 'image/webp'
};

function resolveRequestPath(url) {
  const parsed = new URL(url || '/', `http://${HOST}:${PORT}`);
  const cleanPath = decodeURIComponent(parsed.pathname);
  const requested = cleanPath === '/' ? '/index.html' : cleanPath;
  const filePath = path.resolve(ROOT, `.${requested}`);

  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
    return null;
  }

  return filePath;
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end('Method Not Allowed');
    return;
  }

  const filePath = resolveRequestPath(req.url);
  if (!filePath) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream'
    });

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`D20 Initiative client: http://${HOST}:${PORT}/`);
});
