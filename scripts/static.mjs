import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('public');
const port = Number(process.env.PORT || 4173);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.mp4': 'video/mp4',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const filePath = path.resolve(root, rel || 'index.html');
  if (filePath !== root && !filePath.startsWith(root + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  const finalPath = fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()
    ? path.join(filePath, 'index.html')
    : filePath;
  fs.readFile(finalPath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(finalPath);
    res.writeHead(200, {
      'Content-Type': types[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Silly Songs test server at http://127.0.0.1:${port}`);
});
