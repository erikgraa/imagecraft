/* Browser-local recipe data and text generation; never executes instructions. */
(function(root) {
'use strict';
const TYPES = ['packages', 'command', 'service', 'copy', 'add', 'label', 'arg', 'env', 'workdir', 'artifact'];
const MAX_FILE = 5 * 1024 * 1024, MAX_TOTAL = 20 * 1024 * 1024;
const imagePattern = /^[a-z0-9][a-z0-9.-]*(?::[0-9]+)?\/[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*(?::[A-Za-z0-9_][A-Za-z0-9_.-]*)?(?:@sha256:[a-f0-9]{64})?$/;
const digestPattern = /^sha256:[a-f0-9]{64}$/;
function fail(message) { throw new Error(message); }
function text(value, max = 10000) { return typeof value === 'string' && value.length <= max && !/[\x00-\x08\x0b-\x1f\x7f]/.test(value); }
function line(value, max = 10000) { return text(value, max) && !/[\r\n]/.test(value); }
function safePath(value) {
 return typeof value === 'string' && value.length <= 200 && /^[A-Za-z0-9_-][A-Za-z0-9._/-]*$/.test(value) && value.split('/').every(part => part && part !== '.' && part !== '..' && !part.endsWith('.') && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part));
}
function destination(value) { return typeof value === 'string' && value.startsWith('/') && (value === '/' || safePath(value.slice(1))); }
function addDestination(value) {
 if (typeof value !== 'string') return false;
 const path = value.endsWith('/') ? value.slice(0, -1) : value;
 return path !== '/' && destination(path);
}
function httpsSource(value) {
 if (!line(value, 500) || !/^https:\/\/[^/?#@]+(?:[/?]|$)/i.test(value) || /[\s\\"'`$<>#]/.test(value) || /%(?![a-f0-9]{2})/i.test(value)) return false;
 try {
  const url = new URL(value), decoded = decodeURIComponent(value);
  return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password && !url.hash && !/[\x00-\x1f\x7f\\"'`$<>#]/.test(decoded) && !/\.git\/?$/i.test(decodeURIComponent(url.pathname)) && !/\.git$/i.test(value);
 } catch { return false; }
}
function localSource(row) { return row.type === 'copy' || (row.type === 'add' && row.sourceKind === 'local'); }
function credentialPath(path) { return /(?:^|\/)(?:\.env(?:\..*)?|\.netrc|\.git-credentials|auth\.json|credentials(?:\..*)?|id_rsa|id_ed25519|.*\.(?:key|pem|p12|pfx))$/i.test(path) || /(?:^|\/)\.docker\/config\.json$/i.test(path); }
function secretLike(value) {
 value = String(value).replace(/\\(["'])/g, '$1');
 return /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})\b|(?:password|passwd|token|secret|api[_-]?key)["']?\s*[=:]\s*["']?(?!\$|<|\{\{|example\b|changeme\b|placeholder\b)[^\s"'<>]+/i.test(value);
}
function bytesToBase64(bytes) {
 if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
 let value = ''; for (let i = 0; i < bytes.length; i += 8192) value += String.fromCharCode(...bytes.subarray(i, i + 8192));
 return btoa(value);
}
function base64ToBytes(value) {
 if (typeof value !== 'string' || value.length > Math.ceil(MAX_FILE / 3) * 4 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) fail('Invalid or oversized file encoding.');
 const bytes = typeof Buffer !== 'undefined' ? new Uint8Array(Buffer.from(value, 'base64')) : Uint8Array.from(atob(value), c => c.charCodeAt(0));
 if (bytes.length > MAX_FILE || bytesToBase64(bytes) !== value) fail('Invalid or oversized file encoding.');
 return bytes;
}
function fileCheck(path, data) {
 if (!safePath(path) || path.startsWith('files/') === false || credentialPath(path) || !tarPath(path)) fail('Files must use safe files/ paths, without traversal or credential filenames.');
 const bytes = base64ToBytes(data);
 if (secretLike(new TextDecoder().decode(bytes))) fail('Possible credential material detected in a file. Remove credentials before importing or exporting.');
 return bytes;
}
function normalize(input) {
 if (!input || typeof input !== 'object' || !['9', '10'].includes(input.version) || !line(input.image, 500) || !Array.isArray(input.rows) || input.rows.length > 100) fail('Invalid recipe schema.');
 const result = { version: input.version, image: input.image, name: line(input.name, 120) ? input.name : 'web-server.recipe', digest: input.digest === undefined ? '' : input.digest, stages: [], rows: [], files: {} };
 if (typeof result.digest !== 'string' || (result.digest && !digestPattern.test(result.digest))) fail('Base digest must be sha256 followed by 64 lowercase hexadecimal characters.');
 if (input.stages !== undefined && (!Array.isArray(input.stages) || input.stages.length > 10)) fail('Use at most ten builder stages.');
 for (const stage of input.stages || []) {
  if (!stage || typeof stage.name !== 'string' || !/^[a-z][a-z0-9_-]{0,30}$/.test(stage.name) || stage.name === 'os' || !line(stage.base, 500) || !imagePattern.test(stage.base) || result.stages.some(s => s.name === stage.name)) fail('Builder stages need unique lowercase names (not os) and qualified image references.');
  result.stages.push({ name: stage.name, base: stage.base });
 }
 const ids = new Set();
 for (const row of input.rows) {
  if (!row || !line(row.id, 100) || !/^[A-Za-z0-9_-]+$/.test(row.id) || ids.has(row.id) || !TYPES.includes(row.type) || !line(row.value)) fail('Invalid step schema: single-line values and unique IDs are required.');
  ids.add(row.id);
  const clean = { id: row.id, type: row.type, value: row.value };
  if (row.comment !== undefined) { if (row.type !== 'packages' || !line(row.comment, 500)) fail('Use a single-line package comment of at most 500 characters.'); clean.comment = row.comment; }
  for (const field of ['stage', 'source', 'sourceKind', 'destination', 'mode', 'from']) if (row[field] !== undefined) { if (!line(row[field], 500)) fail('Invalid step field.'); clean[field] = row[field]; }
  if (clean.stage && !result.stages.some(s => s.name === clean.stage)) fail('Step refers to an unknown builder stage.');
  result.rows.push(clean);
 }
 if (input.files !== undefined) {
  if (!input.files || typeof input.files !== 'object' || Array.isArray(input.files) || Object.keys(input.files).length > 100) fail('Invalid file collection.');
  let total = 0; const paths = new Set();
  for (const [path, data] of Object.entries(input.files)) { const lower = path.toLowerCase(); if ([...paths].some(existing => existing === lower || existing.startsWith(lower + '/') || lower.startsWith(existing + '/'))) fail('File paths must not collide as files/directories or on case-insensitive filesystems.'); paths.add(lower); total += fileCheck(path, data).length; if (total > MAX_TOTAL) fail('File collection exceeds 20 MiB.'); result.files[path] = data; }
 }
 return result;
}
function rowError(row, recipe) {
 if (!TYPES.includes(row.type) || !line(row.value)) return 'Use a supported step with a single-line value.';
 if (row.comment !== undefined && (row.type !== 'packages' || !line(row.comment, 500))) return 'Use a single-line package comment of at most 500 characters.';
 if (secretLike(Object.values(row).join(' '))) return 'Possible credential material detected. Remove it; recipe text is not secret storage.';
 const value = row.value.trim();
 if (['copy', 'add', 'artifact'].includes(row.type)) {
  if (row.type === 'add') {
   if (!['local', 'https'].includes(row.sourceKind)) return 'Choose a local file/archive or HTTPS URL source for ADD.';
   if (row.from) return 'ADD does not copy from builder stages; use Artifact COPY instead.';
   if (!addDestination(row.destination)) return 'Use an explicit absolute destination without traversal; end directory paths with /.';
  } else if (!destination(row.destination) || row.destination === '/') return 'Use an explicit absolute destination file path without traversal.';
  if (!/^[0-7]{3,4}$/.test(row.mode || '')) return 'Specify octal permissions, such as 0644 or 0755.';
  if (localSource(row)) {
   if (!safePath(row.source) || !row.source.startsWith('files/') || credentialPath(row.source)) return 'Select a local file and use a safe files/ source path.';
   if (!Object.hasOwn(recipe.files || {}, row.source)) return 'Select the referenced local file again (file bytes are never saved to browser storage).';
  } else if (row.type === 'add') {
   if (!httpsSource(row.source)) return 'Use a valid HTTPS file URL without credentials, fragments, Git repositories, whitespace or instruction metacharacters. Percent-encode URL spaces.';
   if (row.destination.endsWith('/') && decodeURIComponent(new URL(row.source).pathname).endsWith('/')) return 'Use an explicit destination filename when the HTTPS URL has no filename.';
  } else {
   const sourceStage = recipe.stages.findIndex(s => s.name === row.from);
   const targetStage = row.stage ? recipe.stages.findIndex(s => s.name === row.stage) : recipe.stages.length;
   if (sourceStage < 0 || sourceStage >= targetStage) return 'Artifact COPY must reference an earlier builder stage, never the final OS or a remote image.';
   if (!destination(row.source) || row.source === '/') return 'Use an absolute artifact file path without traversal.';
  }
  return '';
 }
 if (!value) return 'Enter a value or remove this step.';
 if (row.type === 'packages' && !/^[A-Za-z0-9][A-Za-z0-9+_.-]*(?:\s+[A-Za-z0-9][A-Za-z0-9+_.-]*)*$/.test(value)) return 'Use package names separated by spaces; flags and shell operators are not allowed.';
 if (row.type === 'service' && (!/^[A-Za-z0-9][A-Za-z0-9@_.-]*$/.test(value) || row.stage)) return 'Enable a single systemd unit in the final OS stage only.';
 if (row.type === 'label' && !/^[A-Za-z][A-Za-z0-9_.-]*=.+$/.test(value)) return 'Use a metadata key=value pair.';
 if (row.type === 'env' && !/^[A-Za-z_][A-Za-z0-9_]*=.*$/.test(value)) return 'Use NAME=value for an environment variable.';
 if (row.type === 'arg' && !/^[A-Za-z_][A-Za-z0-9_]*(?:=.*)?$/.test(value)) return 'Use NAME or NAME=default for a build-time argument.';
 if (row.type === 'workdir' && !destination(value)) return 'Use an absolute working directory without traversal.';
 return '';
}
function errors(recipe) {
 const problems = [];
 if (!imagePattern.test(recipe.image.trim()) || recipe.image.includes('@')) problems.push('Use a qualified destination image reference with an optional tag, not a digest.');
 if (recipe.digest && !digestPattern.test(recipe.digest)) problems.push('Use sha256: followed by 64 lowercase hexadecimal characters.');
 let lastStage = -1;
 for (const row of recipe.rows) {
  const index = row.stage ? recipe.stages.findIndex(s => s.name === row.stage) : recipe.stages.length;
  if (index < lastStage || index < 0) problems.push('Order builder steps before later stages and final OS steps.');
  lastStage = index;
  const problem = rowError(row, recipe); if (problem) problems.push(problem);
 }
 return [...new Set(problems)];
}
function baseReference(recipe) { return `registry.redhat.io/rhel${recipe.version}/rhel-bootc${recipe.digest ? '@' + recipe.digest : ':latest'}`; }
function instruction(row) {
 const value = row.value.trim();
 if (row.type === 'packages') return `RUN dnf install -y ${value.split(/\s+/).join(' ')} \\\n    && dnf clean all`;
 if (row.type === 'command') return 'RUN ' + value;
 if (row.type === 'service') return 'RUN systemctl enable ' + value;
 if (['copy', 'add', 'artifact'].includes(row.type)) return `${row.type === 'add' ? 'ADD' : 'COPY'} ${row.type === 'artifact' ? '--from=' + row.from + ' ' : ''}--chmod=${row.mode} ${JSON.stringify([row.source, row.destination])}`;
 if (row.type === 'workdir') return 'WORKDIR ' + value;
 if (row.type === 'arg') { const index = value.indexOf('='); return 'ARG ' + (index < 0 ? value : value.slice(0, index) + '=' + JSON.stringify(value.slice(index + 1))); }
 const index = value.indexOf('='); return row.type.toUpperCase() + ' ' + value.slice(0, index) + '=' + JSON.stringify(value.slice(index + 1));
}
function containerfile(recipe) {
 const lines = ['# Generated by Imagecraft — review and test before use'];
 const stages = [...recipe.stages, { name: 'os', base: baseReference(recipe) }];
 for (const stage of stages) {
  lines.push(`FROM ${stage.base}${recipe.stages.length ? ' AS ' + stage.name : ''}`, '');
  recipe.rows.forEach((row, index) => { if ((row.stage || 'os') !== stage.name) return; const problem = rowError(row, recipe); lines.push(`# ${String(index + 1).padStart(2, '0')} / ${row.type}`); if (!problem && row.type === 'packages' && row.comment?.trim()) lines.push('# ' + row.comment.trim()); lines.push(problem ? '# Incomplete step: ' + problem : instruction(row), ''); });
 }
 lines.push('# Final compatibility check', 'RUN bootc container lint');
 return lines.join('\n') + '\n';
}
function review(recipe) {
 const notes = ['Package availability is NOT verified. On an entitled disposable RHEL build host, review: ' + (recipe.rows.filter(r => r.type === 'packages').map(r => r.value.trim()).join(' ') || '(no package steps)'), 'Review shell commands, SELinux labels, architecture compatibility, first boot, upgrades and rollback. Local checks cannot establish safety or detect every secret.'];
 if (!recipe.digest) notes.push('Base uses mutable :latest; consider a reviewed sha256 digest and plan deliberate refreshes.');
 if (recipe.rows.some(r => ['arg', 'env', 'label'].includes(r.type))) notes.push('ARG is scoped to its build stage; redeclare in each stage. ENV persists in that image stage and affects later RUN. LABEL is public metadata. None is secret storage.');
 for (const row of recipe.rows) {
  if (row.type === 'command' && /\b(?:dnf\s+update|curl.*\|.*sh|chmod\s+777|systemctl\s+start|rm\s+-rf)\b/.test(row.value)) notes.push(`Review step ${recipe.rows.indexOf(row) + 1}: risky or build-time-only command pattern.`);
  if (row.type === 'add') notes.push('Prefer COPY for straightforward local copying. ADD may unpack local tar archives (detected by content) or download HTTPS content AT BUILD TIME; remote archives are not automatically unpacked. Imagecraft never fetches URLs or unpacks selected archives. Review archive contents, provenance, redirects, availability, permissions, ownership and SELinux labels on your build host; directory traversal needs execute permissions. HTTPS alone does not pin content or guarantee reproducibility.');
  if (['copy', 'add', 'artifact'].includes(row.type) && /^\/var\//.test(row.destination)) notes.push('Review /var initialization and persistent state semantics; image updates do not replace runtime application data.');
 }
 if (recipe.stages.length) notes.push('Builder bases and output ABI/architecture must match the selected RHEL OS. Builder files are not included unless explicitly copied. Builders do not inherit final OS ARG/ENV/WORKDIR.');
 return [...new Set(notes)];
}
function checked(recipe) {
 const clean = normalize(recipe), problems = errors(clean);
 if (problems.length) fail(problems.join(' '));
 if (secretLike(clean.image) || secretLike(clean.name)) fail('Possible credential material detected.');
 return clean;
}
function portableExport(recipe) { const clean = checked(recipe), referenced = new Set(clean.rows.filter(localSource).map(row => row.source)); clean.files = Object.fromEntries(Object.entries(clean.files).filter(([path]) => referenced.has(path))); return JSON.stringify({ format: 'imagecraft-recipe', schemaVersion: 2, recipe: clean }, null, 2) + '\n'; }
function portableImport(value) {
 if (typeof value !== 'string' || value.length > 30 * 1024 * 1024) fail('Recipe import exceeds 30 MiB.');
 const document = JSON.parse(value);
 if (!document || document.format !== 'imagecraft-recipe' || document.schemaVersion !== 2) fail('Unsupported portable recipe format/version.');
 return checked(document.recipe);
}
function persisted(recipe) {
 const clean = normalize({ ...recipe, files: {} });
 const values = [clean.name, clean.image, clean.digest, ...clean.stages.flatMap(stage => [stage.name, stage.base]), ...clean.rows.flatMap(row => Object.values(row))];
 if (values.some(secretLike)) fail('Possible credentials detected; browser save paused. Remove credentials.');
 return clean;
}
function buildEntries(recipe, pipeline) {
 const clean = checked(recipe);
 if (!pipeline || !['.github/workflows/build-image.yml', '.gitlab-ci.yml', 'azure-pipelines.yml'].includes(pipeline.filename) || !text(pipeline.content, 100000)) fail('Invalid generated pipeline.');
 const entries = [{ path: 'Containerfile', bytes: new TextEncoder().encode(containerfile(clean)) }];
 const referenced = new Set(clean.rows.filter(localSource).map(r => r.source));
 for (const path of referenced) entries.push({ path, bytes: fileCheck(path, clean.files[path]) });
 // Allowlist context files rather than exporting browser uploads or repository credentials indiscriminately.
 const directories = new Set();
 for (const path of referenced) { const parts = path.split('/'); for (let i = 1; i < parts.length; i++) directories.add(parts.slice(0, i).join('/')); }
 const ignore = ['**', '!Containerfile', ...[...directories].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b)).flatMap(dir => ['!' + dir + '/', dir + '/**']), ...[...referenced].map(path => '!' + path), ''];
 for (const path of ['.containerignore', '.dockerignore']) entries.push({ path, bytes: new TextEncoder().encode([...new Set(ignore)].join('\n')) });
 entries.push({ path: pipeline.filename, bytes: new TextEncoder().encode(pipeline.content) });
 return entries;
}
function tarPath(path) {
 if (path.length <= 100) return { name: path, prefix: '' };
 for (let index = path.lastIndexOf('/'); index > 0; index = path.lastIndexOf('/', index - 1)) if (index <= 155 && path.length - index - 1 <= 100) return { name: path.slice(index + 1), prefix: path.slice(0, index) };
 return null;
}
function tar(entries) {
 const blocks = [], paths = new Set(); let total = 0;
 for (const entry of entries) {
  if (!entry || typeof entry.path !== 'string' || !safePath(entry.path.replace(/^\./, '_')) || !tarPath(entry.path) || !(entry.bytes instanceof Uint8Array) || entry.bytes.length > MAX_FILE || paths.has(entry.path.toLowerCase())) fail('Invalid tar entry.');
  total += entry.bytes.length; if (total > MAX_TOTAL + 1000000) fail('Archive exceeds size limit.'); paths.add(entry.path.toLowerCase());
  const parts = tarPath(entry.path);
  const header = new Uint8Array(512), encoder = new TextEncoder();
  const put = (offset, value) => header.set(encoder.encode(value), offset);
  const octal = (value, length) => value.toString(8).padStart(length - 1, '0') + '\0';
  put(0, parts.name); put(345, parts.prefix); put(100, octal(0o644, 8)); put(108, octal(0, 8)); put(116, octal(0, 8)); put(124, octal(entry.bytes.length, 12)); put(136, octal(0, 12)); put(148, '        '); put(156, '0'); put(257, 'ustar\0'); put(263, '00');
  put(148, header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0') + '\0 ');
  blocks.push(header, entry.bytes, new Uint8Array((512 - entry.bytes.length % 512) % 512));
 }
 blocks.push(new Uint8Array(1024));
 const result = new Uint8Array(blocks.reduce((sum, block) => sum + block.length, 0)); let offset = 0; for (const block of blocks) { result.set(block, offset); offset += block.length; }
 return result;
}
const api = { TYPES, MAX_FILE, MAX_TOTAL, safePath, destination, addDestination, httpsSource, localSource, secretLike, bytesToBase64, base64ToBytes, fileCheck, normalize, rowError, errors, baseReference, containerfile, review, portableExport, portableImport, persisted, buildEntries, tar };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.RecipeEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
