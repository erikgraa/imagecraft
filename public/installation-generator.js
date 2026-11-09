(function (root) {
  function imageReference(value) {
    const image = typeof value === 'string' ? value.trim() : '';
    if (!/^[a-z0-9][a-z0-9.-]*(?::[0-9]+)?\/[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*(?::[A-Za-z0-9_][A-Za-z0-9_.-]*)?(?:@sha256:[a-f0-9]{64})?$/.test(image)) {
      throw new Error('Use a qualified registry/repository reference, with a tag or sha256 digest.');
    }
    return image;
  }

  function publicKey(value) {
    const key = typeof value === 'string' ? value.trim() : '';
    if (!key) return 'ssh-ed25519 REPLACE_WITH_YOUR_PUBLIC_KEY';
    const match = /^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(?:256|384|521)) ([A-Za-z0-9+/]+={0,2})(?: [\x20-\x7e]+)?$/.exec(key);
    if (!match || key.length > 16384) throw new Error('Paste one OpenSSH public key, never a private key or password.');
    let bytes;
    try { bytes = atob(match[2]); } catch { throw new Error('The SSH public key must contain valid base64.'); }
    let offset = 0;
    function field() {
      if (offset + 4 > bytes.length) throw new Error('The SSH public key has a truncated field.');
      const size = bytes.charCodeAt(offset) * 16777216 + bytes.charCodeAt(offset + 1) * 65536 + bytes.charCodeAt(offset + 2) * 256 + bytes.charCodeAt(offset + 3);
      offset += 4;
      if (!size || offset + size > bytes.length) throw new Error('The SSH public key has an invalid field length.');
      const result = bytes.slice(offset, offset + size); offset += size; return result;
    }
    if (field() !== match[1]) throw new Error('The SSH public key encoding does not match its key type.');
    if (match[1] === 'ssh-ed25519') {
      if (field().length !== 32) throw new Error('An Ed25519 public key must have 32 key bytes.');
    } else if (match[1] === 'ssh-rsa') {
      field();
      const modulus = field().replace(/^\x00+/, '');
      const bits = modulus.length ? (modulus.length - 1) * 8 + Math.floor(Math.log2(modulus.charCodeAt(0))) + 1 : 0;
      if (bits < 2048) throw new Error('Use an RSA public key of at least 2048 bits.');
    } else {
      const curve = match[1].slice('ecdsa-sha2-'.length);
      if (field() !== curve || field().length !== ({ nistp256: 65, nistp384: 97, nistp521: 133 })[curve]) throw new Error('The ECDSA public key curve or point length is invalid.');
    }
    if (offset !== bytes.length) throw new Error('The SSH public key has trailing binary data.');
    return key;
  }

  function generate(options) {
    function fail(field, message) { const error = new Error(message); error.field = field; throw error; }
    let image, key;
    try { image = imageReference(options.image); } catch (error) { fail('image', error.message); }
    if (!['9', '10'].includes(options.version)) fail('version', 'Choose RHEL 9 or 10.');
    if (!['qcow2', 'raw', 'vmdk'].includes(options.format)) fail('format', 'Choose QCOW2, raw or vSphere VMDK.');
    if (!['x86_64', 'aarch64'].includes(options.arch)) fail('arch', 'Choose a native x86_64 or aarch64 Linux build host.');
    if (options.format === 'vmdk' && options.arch !== 'x86_64') fail('arch', 'This vSphere path requires x86_64, not aarch64.');
    const user = options.user === undefined ? 'admin' : options.user;
    if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(user) || user === 'root') fail('user', 'Use a non-root Linux username (lowercase letters, digits, _ or -).');
    try { key = publicKey(options.key); } catch (error) { fail('key', error.message); }
    const builder = `registry.redhat.io/rhel${options.version}/bootc-image-builder:latest`;
    const artifact = `output/${options.format === 'raw' ? 'image' : options.format}/disk.${options.format}`;
    const config = ['# Initial disk provisioning, not an OS update or persistent-data backup.', '# Replace the public-key placeholder before building; no password is generated.', '[[customizations.user]]', `name = ${JSON.stringify(user)}`, `key = ${JSON.stringify(key)}`, 'groups = ["wheel"]', ''].join('\n');
    const commands = [
      `test "$(uname -m)" = ${options.arch}`,
      'sudo podman login registry.redhat.io',
      ...(image.split('/')[0] === 'registry.redhat.io' ? [] : [`sudo podman login ${image.split('/')[0]}`]),
      `sudo podman pull '${image}'`,
      'mkdir output',
      `sudo podman run --rm -it --privileged --pull=newer --security-opt label=type:unconfined_t -v ./config.toml:/config.toml:ro -v ./output:/output -v /var/lib/containers/storage:/var/lib/containers/storage ${builder} --type ${options.format} '${image}'`
    ];
    const notes = [
      '# Review every command; run individually on a disposable native Linux host.',
      '# Configure package entitlement separately. Rootful Podman uses its own registry login/storage.',
      '# Save config.toml beside this file; replace any public-key placeholder before building.',
      '# The privileged builder can access the host. Do not run untrusted images.',
      '# Use a NEW output directory. The source image supplies the default root filesystem.',
      '# Expected legacy artifact path; confirm it against your installed builder version.',
      `# ${artifact}`
    ];
    const importCommand = options.format === 'vmdk' ? 'vmkfstools -i "/vmfs/volumes/DATASTORE/import/disk.vmdk" "/vmfs/volumes/DATASTORE/NEW_VM/os.vmdk" -d thin' : '';
    const repository = image.replace(/@sha256:[a-f0-9]{64}$/, '').replace(/:[^/:]+$/, '');
    const immutable = /@sha256:/.test(image) ? image : `${repository}@sha256:REPLACE_WITH_VERIFIED_DIGEST`;
    const signing = {
      image: [`cosign sign --key /secure/path/cosign.key '${immutable}'`, `cosign verify --key /trusted/path/cosign.pub '${immutable}'`].join('\n'),
      disk: [`cosign sign-blob --key /secure/path/cosign.key --bundle disk.sigstore.json '${artifact}'`, `cosign verify-blob --key /trusted/path/cosign.pub --bundle disk.sigstore.json '${artifact}'`, `sha256sum '${artifact}' > disk.sha256`, 'sha256sum --check disk.sha256'].join('\n')
    };
    return { image, immutable, builder, artifact, config, commands: commands.join('\n'), script: ['#!/usr/bin/env bash', 'set -euo pipefail', ...notes, ...commands, ''].join('\n'), importCommand, signing, needsKey: !options.key?.trim() };
  }

  const api = { generate, imageReference, publicKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.InstallationGenerator = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
