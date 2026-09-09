import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const root = resolve('dist');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
};
http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1:4174');
      if (!url.pathname.startsWith('/cartoon-loop/')) {
        res.writeHead(404).end();
        return;
      }
      const name = decodeURIComponent(url.pathname.slice('/cartoon-loop/'.length)) || 'index.html';
      const target = resolve(root, name);
      if (!target.startsWith(root + sep)) {
        res.writeHead(403).end();
        return;
      }
      const data = await readFile(target);
      res.writeHead(200, {
        'Content-Type': types[extname(target)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    } catch {
      res.writeHead(404).end('Not found');
    }
  })
  .listen(4174, '127.0.0.1', () => console.log('Static build: http://127.0.0.1:4174/cartoon-loop/'));
