const test = require('node:test');
const assert = require('node:assert/strict');
const { pipelineImageTarget, generatePipeline } = require('../public/pipeline-generator.js');
const image = 'quay.io/acme/web-server:latest';

test('separates the destination registry and repository from a mutable tag', () => {
  assert.deepEqual(pipelineImageTarget(image), { registry: 'quay.io', repository: 'quay.io/acme/web-server' });
  assert.deepEqual(pipelineImageTarget('registry.example:5000/team/os:v1'), { registry: 'registry.example:5000', repository: 'registry.example:5000/team/os' });
  assert.equal(pipelineImageTarget('quay.io/team/os').repository, 'quay.io/team/os');
});

test('rejects unsafe or malformed image references rather than interpolating them', () => {
  for (const invalid of [null, '', 'os', 'quay.io/team/os;echo bad', 'quay.io/team/$(id)', 'quay.io/team/os\nmalicious', 'quay.io/team//os', 'quay.io/team/os/', 'quay.io/team/../os', 'quay.io/team/os@sha256:123']) {
    assert.throws(() => pipelineImageTarget(invalid));
  }
  assert.throws(() => generatePipeline('unknown', image));
});

for (const [provider, filename] of [['github', '.github/workflows/build-image.yml'], ['gitlab', '.gitlab-ci.yml'], ['azure', 'azure-pipelines.yml']]) {
  test(`${provider} generates the expected artifact and builds the committed Containerfile`, () => {
    const artifact = generatePipeline(provider, image);
    assert.equal(artifact.filename, filename);
    assert.match(artifact.content, /--file Containerfile --tag "\$IMAGE" \./);
    assert.match(artifact.content, /podman push --authfile "\$REGISTRY_AUTH_FILE" "\$IMAGE"/);
    assert.ok(artifact.content.endsWith('\n'));
    assert.ok(!artifact.content.includes(image));
    assert.match(artifact.content, /IMAGE_REPOSITORY: "quay.io\/acme\/web-server"/);
  });

  test(`${provider} isolates auth and uses secret variables rather than credentials`, () => {
    const artifact = generatePipeline(provider, image);
    assert.equal(artifact.secrets.length, 4);
    assert.equal((artifact.content.match(/--password-stdin/g) || []).length, 2);
    assert.match(artifact.content, /umask 077/);
    assert.match(artifact.content, /mktemp -d/);
    assert.match(artifact.content, /trap 'rm -rf -- "\$authdir"' EXIT/);
    assert.match(artifact.content, /Registry credentials do not provide RHEL package entitlement/);
    for (const name of artifact.secrets) assert.ok(artifact.content.includes(`\${${name}:?Configure ${name} as a CI secret}`));
  });
}

test('GitHub uses a scoped runner, reviewed checkout action, and main-only publication', () => {
  const content = generatePipeline('github', image).content;
  assert.match(content, /runs-on: \[self-hosted, linux, imagecraft\]/);
  assert.match(content, /if: github.ref == 'refs\/heads\/main'/);
  assert.match(content, /persist-credentials: false/);
  assert.match(content, /permissions:\n  contents: read/);
  assert.ok(!content.includes('pull_request'));
  assert.ok(content.includes('${{ secrets.REDHAT_REGISTRY_PASSWORD }}'));
  assert.ok(content.includes('${GITHUB_SHA}-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}'));
});

test('GitLab uses a tagged shell runner and default-branch push or web publication', () => {
  const artifact = generatePipeline('gitlab', image);
  assert.match(artifact.runner, /shell-executor/);
  assert.match(artifact.content, /tags: \[imagecraft\]/);
  assert.ok(artifact.content.includes('$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'));
  assert.ok(artifact.content.includes('$CI_PIPELINE_SOURCE == "push" || $CI_PIPELINE_SOURCE == "web"'));
  assert.ok(artifact.content.includes('${CI_COMMIT_SHA}-${CI_PIPELINE_ID}-${CI_JOB_ID}'));
});

test('Azure uses a named pool, explicit secret env mapping, and a non-PR main guard', () => {
  const content = generatePipeline('azure', image).content;
  assert.match(content, /name: Imagecraft-Linux/);
  assert.match(content, /pr: none/);
  assert.ok(content.includes("eq(variables['Build.SourceBranch'], 'refs/heads/main')"));
  assert.ok(content.includes("ne(variables['Build.Reason'], 'PullRequest')"));
  assert.ok(content.includes('REDHAT_REGISTRY_PASSWORD: $(REDHAT_REGISTRY_PASSWORD)'));
  assert.ok(content.includes('${SOURCE_VERSION}-${BUILD_ID}-${JOB_ATTEMPT}'));
});
