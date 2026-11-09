const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const E = require('../public/recipe-engine.js');
const { generatePipeline } = require('../public/pipeline-generator.js');
const recipe = (rows = [], extra = {}) => E.normalize({ version: '10', image: 'quay.io/acme/os:latest', rows, ...extra });
const row = (type, value = '', extra = {}) => ({ id: 'r1', type, value, ...extra });
const data = value => E.bytesToBase64(new TextEncoder().encode(value));
const fileRecipe = () => recipe([row('copy', '', { source: 'files/config.conf', destination: '/etc/example.conf', mode: '0644' })], { files: { 'files/config.conf': data('hello\n') } });

function untar(bytes) {
 const result = []; let offset = 0;
 const string = (start, length) => new TextDecoder().decode(bytes.subarray(start, start + length)).split('\0')[0];
 while (bytes[offset]) {
  const header = bytes.slice(offset, offset + 512), checksum = parseInt(string(offset + 148, 8), 8);
  header.fill(32, 148, 156);
  assert.equal(header.reduce((sum, byte) => sum + byte, 0), checksum);
  assert.equal(string(offset + 257, 6), 'ustar');
  assert.equal(string(offset + 156, 1), '0');
  assert.equal(parseInt(string(offset + 100, 8), 8), 0o644);
  const name = string(offset, 100), prefix = string(offset + 345, 155), size = parseInt(string(offset + 124, 12), 8);
  result.push({ path: prefix ? prefix + '/' + name : name, bytes: bytes.slice(offset + 512, offset + 512 + size) });
  offset += 512 + Math.ceil(size / 512) * 512;
 }
 assert.equal(bytes.length % 512, 0);
 assert.ok(bytes.slice(offset, offset + 1024).every(byte => byte === 0));
 return result;
}

test('migrates original browser recipes without changing order or values, discards unknown fields', () => {
 const old = { version: '9', image: 'quay.io/acme/os:v1', rows: [row('packages', 'httpd curl'), row('command', 'echo hello', { id: 'r2' })], credentials: 'not carried' };
 const migrated = E.normalize(old);
 assert.deepEqual(migrated.rows, old.rows);
 assert.deepEqual(migrated.stages, []);
 assert.deepEqual(migrated.files, {});
 assert.equal(migrated.digest, '');
 assert.ok(!Object.hasOwn(migrated, 'credentials'));
});

test('generates ordered original instructions with immutable final lint', () => {
 const value = recipe([row('packages', 'httpd   curl'), row('service', 'httpd', { id: 'r2' }), row('command', 'echo hello', { id: 'r3' })]);
 const text = E.containerfile(value);
 assert.ok(text.indexOf('RUN dnf install -y httpd curl') < text.indexOf('RUN systemctl enable httpd'));
 assert.ok(text.indexOf('RUN systemctl enable httpd') < text.indexOf('RUN echo hello'));
 assert.match(text, /^# Generated.*\nFROM registry.redhat.io\/rhel10\/rhel-bootc:latest\n/);
 assert.ok(text.endsWith('RUN bootc container lint\n'));
 assert.deepEqual(E.errors(value), []);
});

test('COPY uses explicit permissions and exact JSON source/destination; reload requires reselection', () => {
 const value = fileRecipe();
 assert.match(E.containerfile(value), /COPY --chmod=0644 \["files\/config.conf","\/etc\/example.conf"\]/);
 const stored = E.persisted(value);
 assert.deepEqual(stored.files, {});
 assert.equal(stored.rows[0].source, 'files/config.conf');
 assert.match(E.errors(stored).join(' '), /Select the referenced local file again/);
});

test('portable recipe moves file bytes, settings, stages and row identities without executing anything', () => {
 const value = fileRecipe();
 value.digest = 'sha256:' + 'a'.repeat(64);
 value.stages = [{ name: 'builder', base: 'registry.redhat.io/rhel10/rhel-bootc:latest' }];
 const serialized = E.portableExport(value);
 assert.deepEqual(E.portableImport(serialized), value);
 assert.match(E.containerfile(E.portableImport(serialized)), /FROM registry.redhat.io\/rhel10\/rhel-bootc@sha256:a{64} AS os/);
});

test('rejects unsafe paths, platform-dependent paths, destinations, credentials and case collisions', () => {
 for (const path of ['../escape', 'files/../escape', 'files//x', 'files/./x', '/etc/x', 'C:\\x', 'files\\x', 'files/a b', 'files/a\nx', 'files/%2e%2e/x', 'files/NUL.txt', 'files/con', 'files/x.', 'files/x/']) {
  assert.equal(E.safePath(path), false, path);
  assert.throws(() => E.fileCheck(path, data('hello')), undefined, path);
 }
 for (const path of ['files/.env', 'files/auth.json', 'files/key.pem', 'files/private.key', 'files/id_rsa']) assert.throws(() => E.fileCheck(path, data('hello')), undefined, path);
 for (const destination of ['etc/config', '/etc/../config', '/etc//config', '/etc/a b', '/etc/x\nRUN echo evil']) assert.ok(E.rowError({ ...fileRecipe().rows[0], destination }, fileRecipe()), destination);
 assert.throws(() => recipe([], { files: { 'files/A': data('a'), 'files/a': data('b') } }), /case-insensitive/);
 assert.throws(() => recipe([], { files: { 'files/a': data('a'), 'files/a/b': data('b') } }), /files\/directories/);
});

test('rejects unsupported instructions, malformed schemas, duplicate IDs and instruction-line injection', () => {
 for (const type of ['add', 'from', 'cmd', 'entrypoint', 'user', 'expose', '__proto__']) assert.throws(() => recipe([row(type, 'value')]));
 for (const value of ['echo one\nRUN echo two', 'x\rFROM evil', 'x\0x', 'x\x1bx']) assert.throws(() => recipe([row('command', value)]));
 assert.throws(() => recipe([row('command', 'echo'), row('command', 'echo')]));
 assert.throws(() => recipe(Array.from({ length: 101 }, (_, i) => row('command', 'echo', { id: 'r' + i }))));
 assert.throws(() => recipe([], { stages: [{ base: 'quay.io/acme/build' }] }));
 assert.throws(() => recipe([], { stages: [{ name: 'os', base: 'quay.io/acme/build' }] }));
 assert.throws(() => recipe([], { stages: [{ name: 'build', base: 'evil\nRUN echo x' }] }));
 assert.throws(() => recipe([row('command', 'echo', { stage: 'missing' })]));
 for (const value of ['', '{}', '{"format":"imagecraft-recipe","schemaVersion":3}', '{'] ) assert.throws(() => E.portableImport(value));
});

test('file encodings and size limits reject malformed or oversized input and preserve binary bytes', () => {
 const bytes = new Uint8Array([0, 1, 255, 128, 42]);
 assert.deepEqual(E.base64ToBytes(E.bytesToBase64(bytes)), bytes);
 for (const encoding of ['@@', 'YQ', 'YQ==\n', 'YR==', '====', 'YQ===']) assert.throws(() => E.base64ToBytes(encoding), undefined, encoding);
 assert.throws(() => E.base64ToBytes(E.bytesToBase64(new Uint8Array(E.MAX_FILE + 1))), /oversized/);
 const large = E.bytesToBase64(new Uint8Array(E.MAX_FILE));
 assert.throws(() => recipe([], { files: Object.fromEntries(Array.from({ length: 5 }, (_, i) => ['files/f' + i, large])) }), /20 MiB/);
 assert.throws(() => E.portableImport(' '.repeat(30 * 1024 * 1024 + 1)), /30 MiB/);
});

test('probable credentials block imports, exports and persistence; placeholders are not guarantees', () => {
 for (const value of ['-----BEGIN RSA PRIVATE KEY-----', 'password=actualpassword123', 'password=short', '"token":"realvalue"', 'ghp_' + 'a'.repeat(30)]) {
  assert.equal(E.secretLike(value), true);
  assert.throws(() => E.fileCheck('files/config', data(value)), /credential/);
  assert.throws(() => E.persisted(recipe([row('command', 'echo ' + value)])), /credentials/);
  assert.throws(() => E.portableExport(recipe([row('command', 'echo ' + value)])), /credential/);
 }
 assert.equal(E.secretLike('password=$PASSWORD'), false);
 assert.equal(E.secretLike('password=<runtime-secret>'), false);
 assert.ok(E.persisted(recipe([row('command', 'printf "password=\\"$PASSWORD\\""')])));
 assert.ok(E.fileCheck('files/config.json', data('{"mode":"example"}')));
 assert.throws(() => E.fileCheck('files/.docker/config.json', data('{}')));
 assert.throws(() => E.fileCheck('files/.netrc', data('credential material')));
 assert.ok(E.review(fileRecipe()).some(note => note.includes('cannot establish safety or detect every secret')));
});

test('metadata and build options quote values and keep WORKDIR semantics explicit', () => {
 const value = recipe([row('label', 'org.example.description=Hello "world"'), row('arg', 'MODE=example', { id: 'r2' }), row('env', 'APP_MODE=example', { id: 'r3' }), row('workdir', '/usr/share/example', { id: 'r4' }), row('command', 'echo "$MODE" > flavor', { id: 'r5' })]);
 const text = E.containerfile(value);
 assert.match(text, /LABEL org.example.description="Hello \\"world\\""/);
 assert.match(text, /ARG MODE="example"/);
 assert.match(text, /ENV APP_MODE="example"/);
 assert.match(text, /WORKDIR \/usr\/share\/example/);
 assert.ok(text.indexOf('WORKDIR') < text.indexOf('RUN echo'));
 assert.deepEqual(E.errors(value), []);
 for (const [type, bad] of [['label', 'no-value'], ['arg', '9NAME=x'], ['env', 'NAME'], ['workdir', '../x']]) assert.ok(E.rowError(row(type, bad), value));
});

test('multi-stage copies only earlier artifacts into the final pinned OS stage', () => {
 const value = recipe([row('command', 'mkdir -p /out && echo example > /out/program', { stage: 'build' }), row('artifact', '', { id: 'r2', source: '/out/program', destination: '/usr/bin/program', mode: '0755', from: 'build' })], { stages: [{ name: 'build', base: 'quay.io/acme/builder@sha256:' + 'b'.repeat(64) }], digest: 'sha256:' + 'a'.repeat(64) });
 assert.deepEqual(E.errors(value), []);
 const text = E.containerfile(value);
 assert.match(text, /FROM quay.io\/acme\/builder@sha256:b{64} AS build/);
 assert.match(text, /COPY --from=build --chmod=0755 \["\/out\/program","\/usr\/bin\/program"\]/);
 assert.ok(text.indexOf('RUN mkdir') < text.indexOf(' AS os'));
 assert.ok(text.endsWith('RUN bootc container lint\n'));
 assert.equal((text.match(/RUN bootc container lint/g) || []).length, 1);
 assert.ok(E.rowError({ ...value.rows[1], stage: 'build' }, value));
 assert.ok(E.rowError({ ...value.rows[1], from: 'quay.io/evil/image' }, value));
 assert.ok(E.rowError({ ...value.rows[1], from: 'os' }, value));
 assert.ok(E.rowError(row('service', 'httpd', { stage: 'build' }), value));
 value.rows.reverse();
 assert.match(E.errors(value).join(' '), /Order builder steps/);
 assert.throws(() => E.portableExport(value), /Order builder steps/);
});

test('digest pin validation rejects tags and invalid checksums, local review never claims package validation', () => {
 for (const digest of ['abc', 'sha256:' + 'a'.repeat(63), 'sha256:' + 'A'.repeat(64), 'latest\nFROM evil']) assert.throws(() => recipe([], { digest }));
 const value = recipe([row('packages', 'not-a-real-package')], { digest: 'sha256:' + 'c'.repeat(64) });
 assert.ok(E.baseReference(value).endsWith('@sha256:' + 'c'.repeat(64)));
 assert.ok(E.review(value)[0].includes('Package availability is NOT verified'));
 assert.ok(E.review(value)[0].includes('not-a-real-package'));
});

for (const provider of ['github', 'gitlab', 'azure']) test(`${provider} complete build folder contains exact referenced files, ignore rules and selected workflow`, () => {
 const value = fileRecipe();
 value.files['files/unreferenced.txt'] = data('not exported in build folder');
 const pipeline = generatePipeline(provider, value.image), entries = E.buildEntries(value, pipeline), unpacked = untar(E.tar(entries));
 assert.deepEqual(unpacked, entries);
 assert.deepEqual(entries.map(e => e.path), ['Containerfile', 'files/config.conf', '.containerignore', '.dockerignore', pipeline.filename]);
 assert.equal(new TextDecoder().decode(entries[0].bytes), E.containerfile(value));
 assert.equal(new TextDecoder().decode(entries.at(-1).bytes), pipeline.content);
 assert.equal(new TextDecoder().decode(entries[2].bytes), '**\n!Containerfile\n!files/\nfiles/**\n!files/config.conf\n');
 assert.ok(!entries.some(e => e.path.includes('unreferenced')));
 assert.ok(!Object.hasOwn(E.portableImport(E.portableExport(value)).files, 'files/unreferenced.txt'));
 assert.throws(() => E.buildEntries(value, { filename: '../escape', content: 'x' }));
});

test('ustar handles nested long paths, arbitrary binary bytes, empty files and rejects duplicates/traversal', () => {
 const path = 'files/' + 'a'.repeat(70) + '/' + 'b'.repeat(70);
 const entries = [{ path, bytes: new Uint8Array([0, 255, 1]) }, { path: 'files/empty', bytes: new Uint8Array() }];
 assert.deepEqual(untar(E.tar(entries)), entries);
 assert.throws(() => E.tar([{ path: '../escape', bytes: new Uint8Array() }]));
 assert.throws(() => E.tar([entries[0], entries[0]]));
 assert.throws(() => E.fileCheck('files/' + 'a'.repeat(150), data('hello')));
});

test('all illustrative templates generate complete valid recipes with compatibility notes', () => {
 const html = fs.readFileSync(require.resolve('../public/index.html'), 'utf8');
 const source = html.slice(html.indexOf('const templates=['), html.indexOf('\nfunction applyTemplate'));
 const templates = vm.runInNewContext(source + ';templates', { RecipeEngine: E, TextEncoder });
 assert.equal(templates.length, 6);
 for (const template of templates) {
  const value = recipe(template.rows.map((row, i) => ({ ...row, id: 'r' + i })), { files: template.files || {} });
  assert.deepEqual(E.errors(value), [], template.id);
  assert.match(template.description, /RHEL 9\/10/);
  assert.match(template.description, /illustrative/i);
  assert.ok(E.portableExport(value));
 }
});

test('browser helper works without Node Buffer and base64 round-trips binary files', () => {
 const context = { TextEncoder, TextDecoder, Uint8Array, btoa, atob };
 vm.runInNewContext(fs.readFileSync(require.resolve('../public/recipe-engine.js'), 'utf8'), context);
 const bytes = new Uint8Array([0, 255, 128, 7]);
 assert.deepEqual(context.RecipeEngine.base64ToBytes(context.RecipeEngine.bytesToBase64(bytes)), bytes);
 assert.ok(context.RecipeEngine.portableImport(context.RecipeEngine.portableExport(fileRecipe())));
});
