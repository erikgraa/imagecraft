const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const publicDir = path.join(__dirname, 'public');
const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/recipe-order.js': ['recipe-order.js', 'text/javascript; charset=utf-8'],
  '/pipeline-generator.js': ['pipeline-generator.js', 'text/javascript; charset=utf-8'],
  '/recipe-engine.js': ['recipe-engine.js', 'text/javascript; charset=utf-8'],
  '/installation-generator.js': ['installation-generator.js', 'text/javascript; charset=utf-8'],
  '/social-preview.png': ['social-preview.png', 'image/png'],
};

function createServer() {
  return http.createServer((request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      return response.end('Method not allowed');
    }
    let pathname;
    try {
      pathname = new URL(request.url, 'http://localhost').pathname;
    } catch {
      response.writeHead(400);
      return response.end('Bad request');
    }
    if (pathname === '/favicon.ico') {
      response.writeHead(204);
      return response.end();
    }
    if (!Object.hasOwn(files, pathname)) {
      response.writeHead(404);
      return response.end('Not found');
    }
    const [filename, contentType] = files[pathname];
    fs.readFile(path.join(publicDir, filename), (error, content) => {
      if (error) {
        response.writeHead(500);
        return response.end('Unable to load asset');
      }
      response.writeHead(200, { 'Content-Type': contentType, 'Content-Length': content.length });
      response.end(request.method === 'HEAD' ? undefined : content);
    });
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  const server = createServer();
  server.listen(port, '0.0.0.0', () => console.log(`Imagecraft listening on port ${port}`));
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
      server.close(() => process.exit(0));
      server.closeIdleConnections();
    });
  }
}

module.exports = { createServer };
