const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { generate, imageReference, publicKey } = require('../public/installation-generator.js');
const base = { image: 'quay.io/example/os:reviewed', version: '10', format: 'qcow2', arch: 'x86_64', user: 'admin', key: '' };
const keyType = Buffer.from('ssh-ed25519');
const keySize = Buffer.alloc(4); keySize.writeUInt32BE(keyType.length);
const materialSize = Buffer.alloc(4); materialSize.writeUInt32BE(32);
const validKey = 'ssh-ed25519 ' + Buffer.concat([keySize, keyType, materialSize, Buffer.alloc(32, 1)]).toString('base64') + ' operator@example';

for (const version of ['9', '10']) for (const format of ['qcow2', 'raw', 'vmdk']) {
  test(`RHEL ${version} ${format} generates separated native build commands and config`, () => {
    const result = generate({ ...base, version, format });
    assert.equal(result.builder, `registry.redhat.io/rhel${version}/bootc-image-builder:latest`);
    assert.equal(result.artifact, `output/${format === 'raw' ? 'image' : format}/disk.${format}`);
    assert.ok(result.script.startsWith('#!/usr/bin/env bash\nset -euo pipefail\n'));
    assert.match(result.commands, /test "\$\(uname -m\)" = x86_64/);
    assert.match(result.commands, /sudo podman pull 'quay.io\/example\/os:reviewed'/);
    assert.match(result.commands, /--privileged.*--security-opt label=type:unconfined_t/);
    assert.match(result.commands, /-v \.\/config.toml:\/config.toml:ro/);
    assert.match(result.commands, /-v \/var\/lib\/containers\/storage:\/var\/lib\/containers\/storage/);
    assert.ok(result.commands.includes(`--type ${format}`));
    assert.match(result.config, /\[\[customizations.user\]\]\nname = "admin"/);
    assert.match(result.config, /groups = \["wheel"\]/);
    assert.ok(result.needsKey);
    assert.doesNotMatch(result.config, /password\s*=/);
    assert.doesNotMatch(result.commands, /bootc (?:install|switch|upgrade|rollback)|dd |--target-arch|--rootfs|--type iso/);
    assert.equal(!!result.importCommand, format === 'vmdk');
    if (format === 'vmdk') assert.match(result.importCommand, /^vmkfstools -i .* -d thin$/);
  });
}

test('SSH config accepts a public key and JSON/TOML escapes its comment', () => {
  const result = generate({ ...base, key: validKey + ' "quoted"' });
  assert.equal(result.needsKey, false);
  assert.equal(publicKey(validKey), validKey);
  assert.ok(result.config.includes('\\"quoted\\"'));
  assert.ok(!result.config.includes('REPLACE_WITH_YOUR_PUBLIC_KEY'));
});

test('rejects unsafe references, secrets, malformed config and unsupported targets', () => {
  for (const image of ['example', 'quay.io/example/os; reboot', 'quay.io/example/os\nwhoami', 'https://quay.io/os', 'quay.io/example/os@sha256:abc', 'quay.io/os:$(id)', 'quay.io/os`id`']) {
    assert.throws(() => imageReference(image));
  }
  for (const user of ['root', 'a\nkey="x"', 'admin;id', 'Admin', 'a'.repeat(33)]) assert.throws(() => generate({ ...base, user }));
  for (const key of ['-----BEGIN OPENSSH PRIVATE KEY-----', 'password123', 'ssh-ed25519 AAAA', validKey + '\nother', 'ssh-rsa ' + validKey.split(' ')[1]]) assert.throws(() => generate({ ...base, key }));
  for (const overrides of [{ format: 'iso' }, { version: '11' }, { arch: 'ppc64le' }, { format: 'vmdk', arch: 'aarch64' }]) assert.throws(() => generate({ ...base, ...overrides }));
});

test('native ARM disks and immutable published refs remain distinct from base-image pins', () => {
  const image = 'registry.redhat.io/example/os@sha256:' + 'a'.repeat(64);
  const result = generate({ ...base, image, arch: 'aarch64' });
  assert.match(result.commands, /test "\$\(uname -m\)" = aarch64/);
  assert.equal((result.commands.match(/podman login registry.redhat.io/g) || []).length, 1);
  assert.ok(result.commands.endsWith(`'${image}'`));
  assert.ok(result.signing.image.includes(`'${image}'`));
  assert.doesNotMatch(result.signing.image, /REPLACE_WITH_VERIFIED_DIGEST/);
});

test('signing separates published OCI signature and verification from detached disk bundle', () => {
  const result = generate(base);
  assert.match(result.signing.image, /cosign sign --key \/secure\/path\/cosign.key 'quay.io\/example\/os@sha256:REPLACE_WITH_VERIFIED_DIGEST'/);
  assert.match(result.signing.image, /cosign verify --key \/trusted\/path\/cosign.pub/);
  assert.match(result.signing.disk, /cosign sign-blob .*--bundle disk.sigstore.json 'output\/qcow2\/disk.qcow2'/);
  assert.match(result.signing.disk, /cosign verify-blob .*--bundle disk.sigstore.json/);
  assert.match(result.signing.disk, /sha256sum --check disk.sha256/);
  assert.doesNotMatch(result.signing.image + result.signing.disk, /generate-key|--yes|--insecure|COSIGN_PASSWORD|sudo bootc/);
});

test('helper loads in browser without Node modules and generates the same result', () => {
  const context = vm.createContext({ atob });
  vm.runInContext(fs.readFileSync(require.resolve('../public/installation-generator.js'), 'utf8'), context);
  assert.equal(context.InstallationGenerator.generate(base).commands, generate(base).commands);
  assert.equal(context.InstallationGenerator.publicKey(validKey), validKey);
});
