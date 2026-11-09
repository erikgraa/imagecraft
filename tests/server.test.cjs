const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createServer } = require('../server.cjs');
const { smoke } = require('../scripts/smoke.cjs');

async function fixture(t) {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  return `http://127.0.0.1:${server.address().port}/`;
}

test('serves the chosen app and all helpers without exposing repository files', async t => {
  await smoke(await fixture(t));
});

test('handles HEAD, query strings, missing routes and disallowed methods', async t => {
  const base = await fixture(t);
  const get = await fetch(`${base}?preview=1`);
  const head = await fetch(base, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal(head.headers.get('content-length'), get.headers.get('content-length'));
  assert.equal(head.headers.get('x-content-type-options'), 'nosniff');
  const engineSource = /src="\.\/(recipe-engine\.js\?v=[a-f0-9]{12})"/.exec(await get.text());
  assert.ok(engineSource, 'The app must use a versioned recipe engine');
  const versioned = await fetch(base + engineSource[1]);
  assert.equal(versioned.status, 200);
  assert.match(versioned.headers.get('content-type'), /javascript/);
  assert.equal(await versioned.text(), await (await fetch(base + 'recipe-engine.js')).text());
  const post = await fetch(base, { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET, HEAD');
  assert.equal((await fetch(`${base}favicon.ico`)).status, 204);
  for (const route of ['designs.html', '%2e%2e/server.cjs', 'public/index.html', 'constructor', '%2fetc%2fpasswd']) {
    assert.equal((await fetch(base + route)).status, 404, route);
  }
});
