const fs = require('node:fs');
const path = require('node:path');

function releaseDetails(tag, changelog) {
  const match = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(tag);
  if (!match || (match[4] && match[4].split('.').some(part => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0')))) {
    throw new Error('Use a semantic version tag: vX.Y.Z or vX.Y.Z-prerelease');
  }
  const version = tag.slice(1);
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const heading = new RegExp(`^## \\[${escaped}\\] - (\\d{4}-\\d{2}-\\d{2})\\r?$`, 'm');
  const entry = heading.exec(changelog);
  if (!entry) throw new Error(`CHANGELOG.md needs a dated entry for [${version}]`);
  const date = new Date(`${entry[1]}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== entry[1]) {
    throw new Error('Release date must be a real YYYY-MM-DD date');
  }
  if ((changelog.match(new RegExp(heading.source, 'gm')) || []).length !== 1) {
    throw new Error('Release entry must be unique');
  }
  const remainder = changelog.slice(entry.index + entry[0].length);
  const next = remainder.search(/^## /m);
  const notes = (next === -1 ? remainder : remainder.slice(0, next)).trim();
  if (!notes || !/^[-*] \S/m.test(notes)) throw new Error('Release entry needs at least one change');
  return { version, prerelease: Boolean(match[4]), notes: `${notes}\n` };
}

if (require.main === module) {
  const details = releaseDetails(process.argv[2] || '', fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8'));
  const { version } = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  if (details.version !== version) throw new Error('Release tag must match the version in package.json');
  fs.writeFileSync(path.join(__dirname, '..', 'release-notes.md'), details.notes);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${details.version}\nprerelease=${details.prerelease}\n`);
  }
  console.log(`Validated ${details.version} (${details.prerelease ? 'prerelease' : 'stable'})`);
}

module.exports = { releaseDetails };
