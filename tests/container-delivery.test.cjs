const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const YAML = require('yaml');
const { publicationTags, record, readReceipts, verifyManifest, publish } = require('../scripts/container-delivery.cjs');

const image = 'ghcr.io/erikgraa/imagecraft';
// Synthetic test digests; no real image digests are asserted locally.
const sha = 'a'.repeat(40);
const amd64 = `sha256:${'1'.repeat(64)}`;
const arm64 = `sha256:${'2'.repeat(64)}`;
const imageId = `sha256:${'3'.repeat(64)}`;
const env = { GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: sha, GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1' };
const changelog = '## [1.2.3] - 2026-11-09\n- Stable change\n\n## [1.2.4-rc.1] - 2026-11-09\n- Prerelease change\n';
const receipts = [
  { revision: sha, runId: '123', platform: 'linux/amd64', digest: amd64 },
  { revision: sha, runId: '123', platform: 'linux/arm64', digest: arm64 }
];
const index = {
  schemaVersion: 2,
  mediaType: 'application/vnd.oci.image.index.v1+json',
  manifests: receipts.map(receipt => ({ mediaType: 'application/vnd.oci.image.manifest.v1+json', size: 1234, digest: receipt.digest,
    platform: { os: 'linux', architecture: receipt.platform.split('/')[1] } })),
  annotations: { 'org.opencontainers.image.revision': sha }
};
const clone = value => JSON.parse(JSON.stringify(value));

function directory(t, entries = receipts) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'imagecraft-delivery-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const entry of entries) fs.writeFileSync(path.join(root, `${entry.platform.split('/')[1]}.json`), JSON.stringify(entry));
  return root;
}

function mockPublication(manifests = [index, index, index], failCreate = false) {
  const calls = [];
  let inspections = 0;
  return { calls, run(args) {
    calls.push(args);
    if (args[2] === 'inspect') return JSON.stringify(manifests[inspections++]);
    if (failCreate) throw new Error('GHCR permission denied');
    return '';
  } };
}

test('publication tags preserve main, stable, prerelease and non-push guards', () => {
  assert.deepEqual(publicationTags(env, changelog), ['edge']);
  for (const event of ['pull_request', 'pull_request_target', 'workflow_dispatch', 'schedule']) {
    for (const ref of ['refs/heads/main', 'refs/tags/v1.2.3', 'refs/pull/1/merge']) {
      assert.deepEqual(publicationTags({ ...env, GITHUB_EVENT_NAME: event, GITHUB_REF: ref }, changelog), []);
    }
  }
  assert.deepEqual(publicationTags({ ...env, GITHUB_REF: 'refs/tags/v1.2.3', VERSION: '1.2.3', PRERELEASE: 'false' }, changelog), ['1.2.3', 'latest']);
  assert.deepEqual(publicationTags({ ...env, GITHUB_REF: 'refs/tags/v1.2.4-rc.1', VERSION: '1.2.4-rc.1', PRERELEASE: 'true' }, changelog), ['1.2.4-rc.1']);
  for (const ref of ['refs/heads/topic', 'refs/tags/not-a-version', 'refs/tags/v1.2.03', 'refs/tags/v1.2.4']) {
    assert.throws(() => publicationTags({ ...env, GITHUB_REF: ref }, changelog));
  }
  assert.throws(() => publicationTags({ ...env, GITHUB_REF: 'refs/tags/v1.2.3', VERSION: '1.2.3', PRERELEASE: 'true' }, changelog), /Prerelease flag/);
  assert.throws(() => publicationTags({ ...env, GITHUB_REF: 'refs/tags/v1.2.3', VERSION: '2.0.0', PRERELEASE: 'false' }, changelog), /Version must match/);
});

test('records each pushed digest from the exact checked non-root image without a rebuild', t => {
  for (const arch of ['amd64', 'arm64']) {
    const root = directory(t, []);
    const digest = arch === 'amd64' ? amd64 : arm64;
    const checked = { Id: imageId, Os: 'linux', Architecture: arch,
      Config: { User: 'node', Labels: { 'org.opencontainers.image.revision': sha, 'org.opencontainers.image.source': 'https://github.com/erikgraa/imagecraft' } } };
    const calls = [];
    const staging = `${image}:checked-123-2-${arch}`;
    const run = args => {
      calls.push(args);
      if (args[0] === 'image') return JSON.stringify([{ ...checked, RepoDigests: args[2] === staging ? [`${image}@${digest}`] : [] }]);
      return '';
    };
    const receipt = record({ ...env, IMAGE_ARCH: arch, GITHUB_RUN_ATTEMPT: '2' }, root, run);
    assert.deepEqual(receipt, { revision: sha, runId: '123', platform: `linux/${arch}`, digest });
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, `${arch}.json`), 'utf8')), receipt);
    assert.deepEqual(calls, [['image', 'inspect', 'imagecraft:check'], ['tag', imageId, staging], ['push', staging], ['image', 'inspect', staging]]);
  }
});

test('recording rejects wrong platform, source, user, substituted image and missing digest', t => {
  const root = directory(t, []);
  const checked = { Id: imageId, Os: 'linux', Architecture: 'amd64', Config: { User: 'node', Labels: {
    'org.opencontainers.image.revision': sha, 'org.opencontainers.image.source': 'https://github.com/erikgraa/imagecraft'
  } }, RepoDigests: [`${image}@${amd64}`] };
  const cases = [
    value => { value.Architecture = 'arm64'; },
    value => { value.Os = 'windows'; },
    value => { value.Config.User = 'root'; },
    value => { value.Config.User = '0:0'; },
    value => { value.Config.User = ''; },
    value => { value.Config.Labels['org.opencontainers.image.revision'] = 'b'.repeat(40); },
    value => { value.RepoDigests = []; },
    value => { value.RepoDigests = [`${image}@garbage`]; }
  ];
  for (const mutate of cases) {
    const value = clone(checked);
    mutate(value);
    assert.throws(() => record({ ...env, IMAGE_ARCH: 'amd64' }, root, args => args[0] === 'image' ? JSON.stringify([value]) : ''));
  }
  assert.throws(() => record({ ...env, IMAGE_ARCH: 'amd64' }, root, args => args[0] === 'image' ? JSON.stringify([{ ...checked, Id: args[2] === 'imagecraft:check' ? imageId : arm64 }]) : ''), /substitute/);
  assert.deepEqual(fs.readdirSync(root), []);
});

test('publication accepts successful legs from prior attempts but never another run or commit', t => {
  const root = directory(t);
  assert.deepEqual(readReceipts(root, { ...env, GITHUB_RUN_ATTEMPT: '2' }), receipts);
  for (const invalid of [{ GITHUB_SHA: 'b'.repeat(40) }, { GITHUB_RUN_ID: '124' }, { GITHUB_RUN_ATTEMPT: '../bad' }]) {
    assert.throws(() => readReceipts(root, { ...env, ...invalid }));
  }
  const invalidSets = [receipts.slice(0, 1), [], [{ ...receipts[0], digest: arm64 }, receipts[1]],
    [{ ...receipts[0], digest: 'sha256:bad' }, receipts[1]], [{ ...receipts[0], runId: '122' }, receipts[1]],
    [receipts[0], { ...receipts[1], revision: 'b'.repeat(40) }]];
  for (const entries of invalidSets) assert.throws(() => readReceipts(directory(t, entries), env));
  fs.writeFileSync(path.join(root, 'unexpected.json'), '{}');
  assert.throws(() => readReceipts(root, env), /exactly one/);
});

test('rerunning one platform replaces its receipt while retaining the other checked leg', t => {
  const root = directory(t);
  const replacement = `sha256:${'4'.repeat(64)}`;
  const checked = { Id: imageId, Os: 'linux', Architecture: 'amd64', Config: { User: 'node', Labels: {
    'org.opencontainers.image.revision': sha, 'org.opencontainers.image.source': 'https://github.com/erikgraa/imagecraft'
  } }, RepoDigests: [`${image}@${replacement}`] };
  record({ ...env, GITHUB_RUN_ATTEMPT: '2', IMAGE_ARCH: 'amd64' }, root, args => args[0] === 'image' ? JSON.stringify([checked]) : '');
  const updated = readReceipts(root, { ...env, GITHUB_RUN_ATTEMPT: '2' });
  assert.equal(updated[0].digest, replacement);
  assert.deepEqual(updated[1], receipts[1]);
  const manifest = clone(index);
  manifest.manifests[0].digest = replacement;
  const mocked = mockPublication([manifest, manifest]);
  publish({ ...env, GITHUB_RUN_ATTEMPT: '2' }, root, changelog, mocked.run);
  assert.deepEqual(mocked.calls[0].slice(-2), [`${image}@${replacement}`, `${image}@${arm64}`]);
});

test('manifest checks reject missing, duplicate, extra, wrong-digest and non-runnable platforms', () => {
  assert.deepEqual(verifyManifest(clone(index), receipts), index);
  const dockerIndex = clone(index);
  dockerIndex.mediaType = 'application/vnd.docker.distribution.manifest.list.v2+json';
  dockerIndex.manifests.forEach(entry => { entry.mediaType = 'application/vnd.docker.distribution.manifest.v2+json'; });
  dockerIndex.manifests[1].platform.variant = 'v8';
  verifyManifest(dockerIndex, receipts);
  const cases = [
    value => { value.schemaVersion = 1; },
    value => { value.mediaType = 'application/vnd.oci.image.manifest.v1+json'; },
    value => { value.manifests.pop(); },
    value => { value.manifests.push(clone(value.manifests[0])); },
    value => { value.manifests[1].platform.architecture = 'amd64'; },
    value => { value.manifests[1].platform.architecture = 'unknown'; },
    value => { value.manifests[0].digest = arm64; },
    value => { value.manifests[0].size = 0; },
    value => { value.manifests[0].mediaType = index.mediaType; },
    value => { value.manifests[0].platform.os = 'windows'; },
    value => { value.manifests[1].platform.variant = 'v9'; }
  ];
  for (const mutate of cases) { const value = clone(index); mutate(value); assert.throws(() => verifyManifest(value, receipts)); }
});

test('assembly verifies candidate before promoting and verifies every final tag', t => {
  const root = directory(t);
  const mocked = mockPublication();
  const stable = { ...env, GITHUB_REF: 'refs/tags/v1.2.3', VERSION: '1.2.3', PRERELEASE: 'false' };
  assert.deepEqual(publish(stable, root, changelog, mocked.run), ['1.2.3', 'latest']);
  assert.deepEqual(mocked.calls[0].slice(-2), [`${image}@${amd64}`, `${image}@${arm64}`]);
  assert.deepEqual(mocked.calls.slice(1), [
    ['buildx', 'imagetools', 'inspect', '--raw', `${image}:checked-123-1-index`],
    ['buildx', 'imagetools', 'create', '--tag', `${image}:1.2.3`, '--tag', `${image}:latest`, `${image}:checked-123-1-index`],
    ['buildx', 'imagetools', 'inspect', '--raw', `${image}:1.2.3`],
    ['buildx', 'imagetools', 'inspect', '--raw', `${image}:latest`]
  ]);
  for (const [event, tags] of [[env, ['edge']], [{ ...env, GITHUB_REF: 'refs/tags/v1.2.4-rc.1', VERSION: '1.2.4-rc.1', PRERELEASE: 'true' }, ['1.2.4-rc.1']]]) {
    const run = mockPublication();
    assert.deepEqual(publish({ ...event, GITHUB_RUN_ATTEMPT: '2' }, root, changelog, run.run), tags);
    assert.ok(run.calls[0].includes(`${image}:checked-123-2-index`));
    assert.ok(!run.calls.flat().includes(`${image}:latest`));
  }
});

test('failed candidate, final manifest or registry command blocks successful publication', t => {
  const root = directory(t);
  const bad = clone(index);
  bad.manifests[0].digest = arm64;
  const candidate = mockPublication([bad]);
  assert.throws(() => publish(env, root, changelog, candidate.run), /checked linux\/amd64 digest/);
  assert.equal(candidate.calls.length, 2, 'No final tags before candidate verification');
  assert.throws(() => publish(env, root, changelog, mockPublication([index, bad]).run));
  const changed = clone(index);
  changed.annotations['org.opencontainers.image.revision'] = 'b'.repeat(40);
  assert.throws(() => publish(env, root, changelog, mockPublication([index, changed]).run), /match the verified index/);
  assert.throws(() => publish(env, root, changelog, mockPublication([], true).run), /permission denied/);
  const stable = { ...env, GITHUB_REF: 'refs/tags/v1.2.3', VERSION: '1.2.3', PRERELEASE: 'false' };
  assert.throws(() => publish(stable, root, changelog, mockPublication([index, index, bad]).run));
  for (const event of ['pull_request', 'workflow_dispatch']) {
    const mocked = mockPublication();
    assert.throws(() => publish({ ...env, GITHUB_EVENT_NAME: event }, root, changelog, mocked.run), /must not publish/);
    assert.throws(() => record({ ...env, GITHUB_EVENT_NAME: event, IMAGE_ARCH: 'amd64' }, root, mocked.run), /Only push/);
    assert.equal(mocked.calls.length, 0);
  }
});

const workflow = YAML.parse(fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'delivery.yml'), 'utf8'), { uniqueKeys: true });
function condition(expression, event, ref) {
  return Boolean(vm.runInNewContext(expression || 'true', { github: { event_name: event, ref }, startsWith: (value, prefix) => value.startsWith(prefix) }));
}

test('native architecture matrix preserves hardened HTTP smoke on each built image', () => {
  const build = workflow.jobs.container;
  assert.equal(build.needs, 'check');
  assert.equal(build.strategy['fail-fast'], false);
  assert.deepEqual(build.strategy.matrix.include, [{ arch: 'amd64', runner: 'ubuntu-24.04' }, { arch: 'arm64', runner: 'ubuntu-24.04-arm' }]);
  assert.equal(build['runs-on'], '${{ matrix.runner }}');
  assert.equal(build.env.IMAGE_ARCH, '${{ matrix.arch }}');
  const steps = build.steps;
  const buildIndex = steps.findIndex(step => step.uses?.startsWith('docker/build-push-action@'));
  const smokeIndex = steps.findIndex(step => step.name === 'Smoke-test non-root read-only container');
  const recordIndex = steps.findIndex(step => step.run === 'node scripts/container-delivery.cjs record');
  assert.ok(buildIndex < smokeIndex && smokeIndex < recordIndex);
  assert.equal(steps[buildIndex].with.platforms, 'linux/${{ matrix.arch }}');
  assert.equal(steps[buildIndex].with.load, true);
  assert.equal(steps[buildIndex].with.push, false);
  assert.equal(steps[buildIndex].with.provenance, false);
  const smoke = steps[smokeIndex].run;
  for (const text of ['--platform "linux/$IMAGE_ARCH"', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '127.0.0.1:8080:8080', 'node scripts/smoke.cjs', 'process.getuid() === 0', 'process.arch', 'IMAGE_ARCH="$IMAGE_ARCH"']) assert.ok(smoke.includes(text), text);
  assert.ok(smoke.indexOf('trap ') < smoke.indexOf('docker run'), 'Cleanup must be registered before starting container');
  assert.ok(!steps.slice(smokeIndex + 1).some(step => /docker (build|buildx build)/.test(step.run || '')), 'Never rebuild after smoke checks');
});

test('workflow publish guards and dependencies preserve PR, manual, Pages and release behavior', () => {
  const jobs = workflow.jobs;
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.deepEqual(workflow.concurrency, { group: 'delivery-${{ github.ref }}', 'cancel-in-progress': false });
  for (const job of Object.values(jobs)) assert.ok(job.permissions, 'Explicit job permissions');
  assert.deepEqual(jobs['container-publish'].needs, ['check', 'container']);
  assert.deepEqual(jobs.release.needs, ['check', 'container-publish']);
  assert.deepEqual(jobs['pages-artifact'].needs, 'check');
  assert.equal(jobs.pages.needs, 'pages-artifact');
  assert.equal(jobs['pages-artifact'].steps.find(step => step.uses?.startsWith('actions/upload-pages-artifact@')).with.path, 'public');
  assert.equal(jobs.pages.environment.name, 'github-pages');
  assert.deepEqual(jobs.pages.permissions, { pages: 'write', 'id-token': 'write' });
  assert.ok(jobs.check.steps.find(step => step.id === 'release').run.includes('git merge-base --is-ancestor HEAD origin/main'));
  assert.ok(jobs.check.steps.find(step => step.id === 'release').run.includes('node scripts/release.cjs "$RELEASE_TAG"'));
  const release = jobs.release.steps.find(step => step.name === 'Create release from changelog').run;
  for (const text of ['--verify-tag', '--prerelease --latest=false', 'gh release view', 'leaving published notes unchanged']) assert.ok(release.includes(text));
  const publishingSteps = jobs.container.steps.filter(step => /docker\/login-action|actions\/upload-artifact/.test(step.uses || '') || step.run === 'node scripts/container-delivery.cjs record');
  assert.equal(publishingSteps.length, 3);
  for (const [event, ref, publishes, pages, releases] of [
    ['push', 'refs/heads/main', true, true, false],
    ['push', 'refs/tags/v1.2.3', true, false, true],
    ['push', 'refs/tags/v1.2.4-rc.1', true, false, true],
    ['pull_request', 'refs/pull/1/merge', false, false, false],
    ['pull_request', 'refs/heads/main', false, false, false],
    ['workflow_dispatch', 'refs/heads/main', false, true, false],
    ['workflow_dispatch', 'refs/tags/v1.2.3', false, false, false],
    ['push', 'refs/heads/topic', false, false, false]
  ]) {
    assert.equal(condition(jobs['container-publish'].if, event, ref), publishes, `${event} ${ref}`);
    for (const step of publishingSteps) assert.equal(condition(step.if, event, ref), publishes);
    assert.equal(condition(jobs['pages-artifact'].if, event, ref), pages);
    assert.equal(condition(jobs.release.if, event, ref), releases);
  }
  const upload = publishingSteps.find(step => step.uses?.startsWith('actions/upload-artifact@'));
  assert.equal(upload.with.overwrite, true);
  assert.equal(upload.with.name, 'checked-digest-${{ matrix.arch }}');
  assert.equal(upload.with['if-no-files-found'], 'error');
  const download = jobs['container-publish'].steps.find(step => step.uses?.startsWith('actions/download-artifact@'));
  assert.equal(download.with.pattern, 'checked-digest-*');
  assert.equal(download.with['merge-multiple'], true);
  for (const job of Object.values(jobs)) for (const step of job.steps) {
    if (step.uses) assert.match(step.uses, /@[a-f0-9]{40}$/, 'Actions must use reviewed commit pins');
    if (step.uses?.startsWith('actions/checkout@')) assert.equal(step.with['persist-credentials'], false);
  }
});
