const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { releaseDetails } = require('./release.cjs');

const image = 'ghcr.io/erikgraa/imagecraft';
const architectures = ['amd64', 'arm64'];
const digestPattern = /^sha256:[a-f0-9]{64}$/;

function publicationTags(env, changelog) {
  if (env.GITHUB_EVENT_NAME !== 'push') return [];
  if (env.GITHUB_REF === 'refs/heads/main') return ['edge'];
  assert.ok(env.GITHUB_REF?.startsWith('refs/tags/v'), 'Only main pushes and validated version tags may publish');
  const details = releaseDetails(env.GITHUB_REF.slice('refs/tags/'.length), changelog);
  assert.equal(env.VERSION, details.version, 'Version must match the validated release');
  assert.equal(env.PRERELEASE, String(details.prerelease), 'Prerelease flag must match the validated release');
  return details.prerelease ? [details.version] : [details.version, 'latest'];
}

function context(env) {
  assert.equal(env.GITHUB_EVENT_NAME, 'push', 'Only push events may publish');
  assert.ok(env.GITHUB_REF === 'refs/heads/main' || env.GITHUB_REF?.startsWith('refs/tags/v'), 'Unsupported publication ref');
  assert.match(env.GITHUB_SHA || '', /^[a-f0-9]{40}$/, 'Expected source commit SHA');
  assert.match(env.GITHUB_RUN_ID || '', /^[1-9]\d*$/, 'Expected workflow run ID');
  assert.match(env.GITHUB_RUN_ATTEMPT || '', /^[1-9]\d*$/, 'Expected workflow run attempt');
  return { revision: env.GITHUB_SHA, runId: env.GITHUB_RUN_ID };
}

function docker(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `docker ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

function record(env, directory, run = docker) {
  const identity = context(env);
  assert.ok(architectures.includes(env.IMAGE_ARCH), 'Unsupported image architecture');
  const [checked] = JSON.parse(run(['image', 'inspect', 'imagecraft:check']));
  assert.equal(checked.Os, 'linux');
  assert.equal(checked.Architecture, env.IMAGE_ARCH);
  assert.match(checked.Id || '', digestPattern);
  assert.equal(checked.Config.Labels['org.opencontainers.image.revision'], identity.revision);
  assert.equal(checked.Config.Labels['org.opencontainers.image.source'], 'https://github.com/erikgraa/imagecraft');
  assert.ok(checked.Config.User && !['root', '0'].includes(checked.Config.User.split(':')[0]), 'Image must be configured non-root');
  const staging = `${image}:checked-${identity.runId}-${env.GITHUB_RUN_ATTEMPT}-${env.IMAGE_ARCH}`;
  run(['tag', checked.Id, staging]);
  run(['push', staging]);
  const [pushed] = JSON.parse(run(['image', 'inspect', staging]));
  assert.equal(pushed.Id, checked.Id, 'Do not rebuild or substitute the checked image');
  const digests = [...new Set((pushed.RepoDigests || []).filter(ref => ref.startsWith(`${image}@`)).map(ref => ref.slice(image.length + 1)))];
  assert.equal(digests.length, 1, 'Expected one pushed image digest');
  assert.match(digests[0], digestPattern);
  const receipt = { ...identity, platform: `linux/${env.IMAGE_ARCH}`, digest: digests[0] };
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, `${env.IMAGE_ARCH}.json`), `${JSON.stringify(receipt)}\n`);
  return receipt;
}

function readReceipts(directory, env) {
  const identity = context(env);
  assert.deepEqual(fs.readdirSync(directory).sort(), architectures.map(arch => `${arch}.json`), 'Need exactly one checked digest per supported platform');
  const receipts = architectures.map(arch => {
    const receipt = JSON.parse(fs.readFileSync(path.join(directory, `${arch}.json`), 'utf8'));
    assert.equal(receipt.platform, `linux/${arch}`);
    assert.equal(receipt.revision, identity.revision, 'Reject checked digests from another commit');
    assert.equal(receipt.runId, identity.runId, 'Reject checked digests from another workflow run');
    assert.match(receipt.digest || '', digestPattern);
    return receipt;
  });
  assert.equal(new Set(receipts.map(receipt => receipt.digest)).size, architectures.length, 'Platform digests must be distinct');
  // A successful matrix leg from an earlier attempt is still checked in this
  // run; binding to run + commit supports rerun-failed-jobs without stale data.
  return receipts;
}

function verifyManifest(manifest, receipts) {
  assert.ok(['application/vnd.oci.image.index.v1+json', 'application/vnd.docker.distribution.manifest.list.v2+json'].includes(manifest.mediaType), 'Expected a multi-platform image index');
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.manifests?.length, architectures.length, 'Manifest must contain exactly the two checked platforms');
  const seen = new Set();
  for (const descriptor of manifest.manifests) {
    const platform = `${descriptor.platform?.os}/${descriptor.platform?.architecture}`;
    assert.ok(!seen.has(platform), 'Duplicate platform in manifest');
    seen.add(platform);
    const receipt = receipts.find(entry => entry.platform === platform);
    assert.ok(receipt, `Unexpected manifest platform: ${platform}`);
    assert.equal(descriptor.digest, receipt.digest, `Manifest must use the checked ${platform} digest`);
    assert.ok(Number.isSafeInteger(descriptor.size) && descriptor.size > 0, 'Expected image manifest size');
    assert.ok(['application/vnd.oci.image.manifest.v1+json', 'application/vnd.docker.distribution.manifest.v2+json'].includes(descriptor.mediaType), 'Expected runnable image manifest, not an unchecked nested index');
    assert.ok(!descriptor.platform.variant || (platform === 'linux/arm64' && descriptor.platform.variant === 'v8'), 'Unexpected platform variant');
  }
  return manifest;
}

function publish(env, directory, changelog, run = docker) {
  const tags = publicationTags(env, changelog);
  assert.ok(tags.length, 'This event must not publish');
  const receipts = readReceipts(directory, env);
  const candidate = `${image}:checked-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}-index`;
  run(['buildx', 'imagetools', 'create', '--tag', candidate,
    '--annotation', 'index:org.opencontainers.image.title=Imagecraft',
    '--annotation', 'index:org.opencontainers.image.source=https://github.com/erikgraa/imagecraft',
    '--annotation', `index:org.opencontainers.image.revision=${env.GITHUB_SHA}`,
    ...receipts.map(receipt => `${image}@${receipt.digest}`)]);
  const inspect = ref => JSON.parse(run(['buildx', 'imagetools', 'inspect', '--raw', ref]));
  const manifest = verifyManifest(inspect(candidate), receipts);
  // Carbon-copy the already verified index: final tags never point at a
  // single-platform image, nor at a second (potentially different) build.
  run(['buildx', 'imagetools', 'create', ...tags.flatMap(tag => ['--tag', `${image}:${tag}`]), candidate]);
  for (const tag of tags) {
    const published = verifyManifest(inspect(`${image}:${tag}`), receipts);
    assert.deepEqual(published, manifest, `Published ${tag} must match the verified index`);
  }
  console.log(`Verified ${tags.map(tag => `${image}:${tag}`).join(', ')}: Linux amd64 + arm64`);
  return tags;
}

if (require.main === module) {
  try {
    const directory = path.join(process.cwd(), 'checked-digests');
    if (process.argv[2] === 'record') record(process.env, directory);
    else if (process.argv[2] === 'publish') publish(process.env, directory, fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8'));
    else throw new Error('Use container-delivery.cjs record|publish');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

module.exports = { publicationTags, record, readReceipts, verifyManifest, publish };
