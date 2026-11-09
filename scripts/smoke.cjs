const assert = require('node:assert/strict');

async function smoke(base) {
  const response = await fetch(base);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  const html = await response.text();
  assert.match(html, /<title>Imagecraft/);
  assert.ok(html.includes('Not affiliated with, endorsed by, or sponsored by Red Hat.'));
  assert.ok(!html.includes('designs.html'));
  assert.ok(!html.includes('INTERACTIVE CONCEPT'));
  for (const filename of ['recipe-order.js', 'pipeline-generator.js', 'recipe-engine.js']) {
    const asset = await fetch(new URL(filename, base));
    assert.equal(asset.status, 200, filename);
    assert.match(asset.headers.get('content-type'), /javascript/);
    assert.ok((await asset.text()).length > 100);
  }
  for (const filename of ['README.md', 'server.cjs', 'package.json', 'tests/recipe-order.test.cjs']) {
    assert.equal((await fetch(new URL(filename, base))).status, 404, filename);
  }
}

if (require.main === module) {
  smoke(process.argv[2] || 'http://127.0.0.1:8080/').then(() => console.log('HTTP smoke checks passed')).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { smoke };
