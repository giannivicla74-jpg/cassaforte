const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8080;
const ROOT = path.resolve(__dirname);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8'
};

function send(res, code, msg) {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(msg);
}

const server = http.createServer((req, res) => {
  let reqPath;
  try {
    // Un URL malformato (es. "%E0%A4%A") non deve far cadere il server
    reqPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return send(res, 400, '400 Bad Request');
  }
  if (reqPath.includes('\0')) return send(res, 400, '400 Bad Request');
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

  // Impedisce di uscire dalla cartella dell'app (es. "/%2e%2e/server.js")
  const filePath = path.resolve(ROOT, '.' + reqPath);
  if (!filePath.startsWith(ROOT + path.sep)) return send(res, 403, '403 Forbidden');

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) return send(res, 404, '404 Not Found');
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    });
    fs.createReadStream(filePath).on('error', () => res.destroy()).pipe(res);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Server avviato su http://localhost:${PORT}`);
});
