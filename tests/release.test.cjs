const test = require('node:test');
const assert = require('node:assert/strict');
const { releaseDetails } = require('../scripts/release.cjs');
const log = '# Changelog\n\n## [Unreleased]\n\n- Next work.\n\n## [1.2.3] - 2026-11-09\n\n### Added\n- A change.\n\n## [1.2.2] - 2026-11-08\n\n- Earlier work.\n';

test('extracts only the matching stable release notes', () => {
  assert.deepEqual(releaseDetails('v1.2.3', log), { version: '1.2.3', prerelease: false, notes: '### Added\n- A change.\n' });
});

test('recognizes prereleases without promoting them to stable', () => {
  const result = releaseDetails('v1.2.3-rc.1', log.replace('[1.2.3]', '[1.2.3-rc.1]'));
  assert.equal(result.prerelease, true);
  assert.equal(result.version, '1.2.3-rc.1');
});

test('rejects invalid tags, absent notes, duplicates and invalid dates', () => {
  for (const tag of ['1.2.3', 'v01.2.3', 'v1.2', 'v1.2.3-rc.01', 'v1.2.3+build', 'v2.0.0']) {
    assert.throws(() => releaseDetails(tag, log), undefined, tag);
  }
  assert.throws(() => releaseDetails('v1.2.3', log + '\n## [1.2.3] - 2026-11-09\n- Duplicate.'));
  assert.throws(() => releaseDetails('v1.2.3', log.replace('2026-11-09', '2026-02-30')));
  assert.throws(() => releaseDetails('v1.2.3', log.replace('### Added\n- A change.', '')));
  assert.throws(() => releaseDetails('v1.2.3', '## [Unreleased]\n- Pending work.'));
});
