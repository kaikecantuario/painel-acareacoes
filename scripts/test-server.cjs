const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\//, '') || 'index.html';
  const file = path.resolve(root, name);
  if ((!name.startsWith('assets/') && !['index.html', 'standalone.html'].includes(name)) || !file.startsWith(root + path.sep)) {
    res.writeHead(404); res.end(); return;
  }
  fs.readFile(file, (err, data) => {
    res.writeHead(err ? 404 : 200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(err ? 'Not found' : data);
  });
}).listen(4173, '127.0.0.1');
