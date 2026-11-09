const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('node:fs/promises');
const key = 'ssh-ed25519 ' + Buffer.concat([Buffer.from([0, 0, 0, 11]), Buffer.from('ssh-ed25519'), Buffer.from([0, 0, 0, 32]), Buffer.alloc(32, 1)]).toString('base64') + ' test@example';

test.beforeEach(async ({ page }, info) => {
  await page.addInitScript(mode => localStorage.setItem('imagecraft-color-mode', mode), info.project.name.endsWith('dark') ? 'dark' : 'light');
});
async function clipboard(page) {
  await page.evaluate(() => {
    window.copies = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => window.copies.push(text) } });
  });
}
async function openDetails(page, id) { await page.locator(id).evaluate(el => el.closest('details').open = true); }

test('artifact formats, public-key config, downloads and command copies are generation only', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?view=build');
  await clipboard(page);
  await expect(page.locator('#artifact-target')).toContainText('Replace the public-key placeholder');
  await page.locator('#artifact-key').fill(key);
  await expect(page.locator('#artifact-target')).not.toContainText('Replace the public-key placeholder');
  const digest = 'quay.io/example/test-os@sha256:' + 'a'.repeat(64);
  await page.locator('#artifact-image').fill(digest);
  for (const [format, path] of [['qcow2', 'qcow2/disk.qcow2'], ['raw', 'image/disk.raw'], ['vmdk', 'vmdk/disk.vmdk']]) {
    await page.locator('#artifact-format').selectOption(format);
    await expect(page.locator('#artifact-target')).toContainText('output/' + path);
    await expect(page.locator('#artifact-code')).toContainText('--type ' + format);
    await expect(page.locator('#artifact-code')).toContainText(digest);
    await openDetails(page, '#sign-disk-code');
    await expect(page.locator('#sign-disk-code')).toContainText(`cosign verify-blob --key /trusted/path/cosign.pub --bundle disk.sigstore.json 'output/${path}'`);
    await page.locator('#sign-disk-code button').nth(1).click();
    expect((await page.evaluate(() => window.copies)).at(-1)).toContain('cosign verify-blob');
  }
  await expect(page.locator('#artifact-vsphere')).toBeVisible();
  await page.locator('#artifact-vsphere summary').click();
  const command = await page.locator('#artifact-import-code code').textContent();
  await page.locator('#artifact-import-code button').click();
  expect((await page.evaluate(() => window.copies)).at(-1)).toBe(command);
  await openDetails(page, '#artifact-config');
  await page.locator('#artifact-config-copy').click();
  const config = await page.locator('#artifact-config').textContent();
  expect((await page.evaluate(() => window.copies)).at(-1)).toBe(config);
  expect(config).toContain(key);
  expect(config).not.toMatch(/password\s*=/);
  for (const [id, filename] of [['artifact-config-download', 'config.toml'], ['artifact-download', 'build-disk.sh']]) {
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#' + id).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(filename);
    const content = await fs.readFile(await download.path(), 'utf8');
    if (filename === 'config.toml') expect(content).toBe(config);
    else { expect(content).toContain('--type vmdk'); expect(content).toContain('set -euo pipefail'); expect(content).not.toContain('vmkfstools'); }
  }
  await expect(page.locator('#toast')).toContainText('nothing executed');
  expect(errors).toEqual([]);
});

test('wizard rejects incompatible architecture and secrets without disabling installed-host actions', async ({ page }) => {
  await page.goto('/?view=build');
  await page.locator('#artifact-format').selectOption('vmdk');
  await page.locator('#artifact-arch').selectOption('aarch64');
  await expect(page.locator('#artifact-error')).toContainText('requires x86_64');
  await expect(page.locator('#artifact-download')).toBeDisabled();
  await expect(page.locator('#artifact-config-copy')).toBeDisabled();
  await expect(page.locator('#artifact-code button')).toHaveCount(0);
  await expect(page.locator('#update-code button').first()).toBeEnabled();
  await expect(page.locator('#rollback-code button').first()).toBeEnabled();
  await page.locator('#artifact-format').selectOption('raw');
  await expect(page.locator('#artifact-download')).toBeEnabled();
  await expect(page.locator('#artifact-code')).toContainText('test "$(uname -m)" = aarch64');
  for (const [id, value, error] of [['artifact-image', 'quay.io/os; reboot', 'qualified registry'], ['artifact-user', 'root', 'non-root'], ['artifact-key', '-----BEGIN OPENSSH PRIVATE KEY-----', 'public key']]) {
    await page.locator('#' + id).fill(value);
    await expect(page.locator('#artifact-error')).toContainText(error);
    await expect(page.locator('#artifact-download')).toBeDisabled();
    await expect(page.locator('#artifact-code')).not.toContainText(value);
    await page.locator('#' + id).fill(id === 'artifact-user' ? 'admin' : '');
    await expect(page.locator('#artifact-error')).toBeHidden();
  }
});

test('lifecycle and signing disclosures remain keyboard accessible with exact independent copies', async ({ page }) => {
  await page.goto('/?view=build');
  await clipboard(page);
  await expect(page.getByRole('note', { name: 'Warning: three different trust boundaries' })).toBeVisible();
  await expect(page.locator('#view-build')).toContainText('does not change the running OS');
  await expect(page.locator('#view-build')).toContainText('Coordinate automatic update agents');
  for (const id of ['#switch-code', '#sign-image-code', '#sign-disk-code', '#artifact-config']) {
    const summary = page.locator(id).locator('xpath=ancestor::details').locator('summary').first();
    await summary.focus(); await page.keyboard.press('Enter');
    await expect(page.locator(id)).toBeVisible();
  }
  await page.locator('#switch-code button').nth(1).click();
  expect((await page.evaluate(() => window.copies)).at(-1)).toMatch(/^sudo bootc switch 'quay.io\/acme\/web-server@sha256:REPLACE_WITH_VERIFIED_DIGEST'$/);
  await page.locator('#sign-image-code button').nth(1).click();
  expect((await page.evaluate(() => window.copies)).at(-1)).toMatch(/^cosign verify --key /);
  await expect(page.locator('#view-build')).toContainText('it does not configure bootc pull enforcement');
  await page.getByText('bootc enforcement · configure and test host trust separately', { exact: true }).click();
  await expect(page.locator('#view-build')).toContainText('unsigned, wrong-key and wrong-repository');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('wizard follows recipe version/destination without changing recipe, pins or persisted keys', async ({ page }) => {
  await page.goto('/?view=compose');
  await page.locator('#registry').fill('quay.io/example/new-os:v2');
  await page.locator('[data-version="9"]').click();
  const before = await page.evaluate(() => localStorage.getItem('imagecraft-ordered-recipe-v1'));
  await page.getByRole('button', { name: 'Build & deploy', exact: true }).click();
  await expect(page.locator('#artifact-code')).toContainText('rhel9/bootc-image-builder:latest');
  await expect(page.locator('#artifact-target')).toContainText('quay.io/example/new-os:v2');
  await page.locator('#artifact-key').fill(key);
  await page.locator('#artifact-user').fill('operator');
  await page.locator('#artifact-image').fill('quay.io/example/other-os@sha256:' + 'b'.repeat(64));
  await page.getByRole('button', { name: 'Compose', exact: true }).click();
  await expect(page.locator('#registry')).toHaveValue('quay.io/example/new-os:v2');
  expect(await page.evaluate(() => localStorage.getItem('imagecraft-ordered-recipe-v1'))).toBe(before);
  expect(await page.evaluate(() => Object.values(localStorage).join(' '))).not.toContain(key);
  await page.goto('/?view=build');
  await expect(page.locator('#artifact-key')).toHaveValue('');
  await expect(page.locator('#artifact-image')).toHaveValue('');
  await expect(page.locator('#artifact-user')).toHaveValue('admin');
});
