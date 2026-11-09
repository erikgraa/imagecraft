const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const YAML = require('yaml');
const { generatePipeline } = require('../public/pipeline-generator.js');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
let scripts = 0;
for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  const src = /src="([^"]+)"/.exec(match[1]);
  const source = src ? fs.readFileSync(path.join(root, 'public', src[1]), 'utf8') : match[2];
  new vm.Script(source, { filename: src ? src[1] : 'index.html:inline' });
  scripts++;
}
assert.equal(scripts, 4);
assert.ok(html.includes('src="./recipe-engine.js"'));
for (const id of ['export-folder', 'export-recipe', 'import-recipe', 'base-digest', 'apply-digest', 'add-stage', 'local-checks']) {
  assert.ok(html.includes(`id="${id}"`), `Missing recipe feature control ${id}`);
}
assert.ok(!html.includes('designs.html'));
for (const key of ['imagecraft-ordered-recipe-v1', 'imagecraft-color-mode', 'imagecraft-pipeline-provider']) {
  assert.ok(html.includes(key), `Preserve browser preference key ${key}`);
}
assert.equal(fs.readFileSync(path.join(root, 'public', 'CNAME'), 'utf8').trim(), 'imagecraft.graa.dev');
for (const file of fs.readdirSync(path.join(root, '.github', 'workflows'))) {
  const document = YAML.parse(fs.readFileSync(path.join(root, '.github', 'workflows', file), 'utf8'), { uniqueKeys: true });
  assert.ok(document.on && document.jobs, `Invalid workflow ${file}`);
}
const dependabot = YAML.parse(fs.readFileSync(path.join(root, '.github', 'dependabot.yml'), 'utf8'), { uniqueKeys: true });
assert.equal(dependabot.version, 2);
assert.deepEqual(dependabot.updates.map(update => update['package-ecosystem']).sort(), ['docker', 'github-actions', 'npm']);
for (const update of dependabot.updates) {
  assert.equal(update.directory, '/');
  assert.equal(update.schedule.interval, 'weekly');
  assert.equal(update.schedule.timezone, 'Europe/Oslo');
}
for (const provider of ['github', 'gitlab', 'azure']) {
  YAML.parse(generatePipeline(provider, 'quay.io/example/os:latest').content, { uniqueKeys: true });
}
console.log('Frontend syntax, runtime wiring, preferences, domain, workflows and generated YAML validated');
