const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('node:fs/promises');
const E = require('../../public/recipe-engine.js');

const pin = 'sha256:' + 'a'.repeat(64);
const fixture = E.normalize({
  name: 'custom.recipe', version: '9', image: 'quay.io/example/custom:v2', digest: pin,
  stages: [{ name: 'builder', base: 'quay.io/example/builder:v1' }],
  rows: [
    { id: 'build', type: 'command', value: 'echo build > /out/program', stage: 'builder' },
    { id: 'copy', type: 'copy', value: '', source: 'files/config.conf', destination: '/etc/custom.conf', mode: '0644' },
    { id: 'add', type: 'add', value: '', sourceKind: 'local', source: 'files/bundle.tar', destination: '/usr/share/custom/', mode: '0755' },
    { id: 'artifact', type: 'artifact', value: '', from: 'builder', source: '/out/program', destination: '/usr/bin/program', mode: '0755' },
  ],
  files: { 'files/config.conf': E.bytesToBase64(Buffer.from('example\n')), 'files/bundle.tar': E.bytesToBase64(E.tar([{ path: 'payload', bytes: new Uint8Array([42]) }])) },
});
const empty = { ...fixture, rows: [], stages: [], files: {} };

async function navigate(page, view) {
  for (const button of await page.locator(`.sidebar [data-view="${view}"],.path [data-view="${view}"]`).all()) {
    if (await button.isVisible()) { await button.click(); return; }
  }
  throw new Error('No visible navigation to ' + view);
}
async function state(page) {
  return page.evaluate(() => ({ recipe, storage: { ...localStorage }, provider: pipelineProvider, tab }));
}
async function download(page, selector) {
  page.once('dialog', dialog => dialog.accept());
  const event = page.waitForEvent('download');
  await page.locator(selector).click();
  return fs.readFile(await (await event).path());
}
function untar(bytes) {
  const entries = {};
  const string = (offset, length) => bytes.subarray(offset, offset + length).toString().split('\0')[0];
  for (let offset = 0; bytes[offset];) {
    const name = string(offset, 100), prefix = string(offset + 345, 155), size = parseInt(string(offset + 124, 12), 8);
    entries[prefix ? prefix + '/' + name : name] = bytes.subarray(offset + 512, offset + 512 + size).toString();
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
}

test.beforeEach(async ({ page }, info) => {
  await page.addInitScript(mode => localStorage.setItem('imagecraft-color-mode', mode), info.project.name.endsWith('dark') ? 'dark' : 'light');
  await page.goto('/?view=compose');
  await page.locator('.recipe-options summary').click();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#recipe-file').setInputFiles({ name: 'custom.recipe.json', mimeType: 'application/json', buffer: Buffer.from(E.portableExport(fixture)) });
  await expect(page.locator('#download')).toBeEnabled();
  await page.locator('#local-checks').uncheck();
  await navigate(page, 'pipeline');
  await page.locator('[data-provider="gitlab"]').click();
  await navigate(page, 'build');
  await page.locator('#artifact-format').selectOption('raw');
  await page.locator('#artifact-user').fill('operator');
  await navigate(page, 'compose');
});

test('Clear cancellation leaves recipe, attached bytes, builders, settings and storage unchanged', async ({ page }) => {
  const before = await state(page);
  const code = await page.locator('#code').textContent();
  page.once('dialog', async dialog => {
    expect(dialog.type()).toBe('confirm');
    expect(dialog.message()).toContain('This cannot be undone');
    expect(dialog.message()).toContain('RHEL version, base pin, image and preferences will be kept');
    await dialog.dismiss();
  });
  await page.locator('#clear').focus();
  await page.keyboard.press('Enter');
  expect(await state(page)).toEqual(before);
  await expect(page.locator('#code')).toHaveText(code);
  await expect(page.locator('#rows .row')).toHaveCount(4);
  await expect(page.locator('#clear')).toBeFocused();
});

test('Clear removes all recipe content, preserves settings, exports cleanly and survives reload', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const before = await state(page);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#clear').focus();
  await page.keyboard.press('Enter');
  expect((await state(page)).recipe).toEqual(empty);
  await expect(page.locator('#rows .row')).toHaveCount(0);
  await expect(page.locator('#rows .empty-state')).toContainText('Add your first');
  await expect(page.locator('[data-add="packages"]')).toBeFocused();
  await expect(page.locator('#step-count')).toHaveText('0 steps');
  await expect(page.locator('#code-status')).toHaveText('0 ordered steps · 1 stage(s) · 1 final check');
  await expect(page.locator('#stage-summary')).toContainText('No builders');
  await expect(page.locator('#remove-stage option')).toHaveCount(0);
  await expect(page.locator('#delete-stage')).toBeDisabled();
  await expect(page.locator('#warning')).toBeHidden();
  await expect(page.locator('#save-status')).toHaveText('saved locally');
  await expect(page.locator('#toast')).toHaveText('Recipe cleared · settings kept');
  await expect(page.locator('#recipe-title')).toHaveText('custom.recipe');
  await expect(page.locator('[data-version="9"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#registry')).toHaveValue(fixture.image);
  await expect(page.locator('#base-digest')).toHaveValue(pin);
  await expect(page.locator('#local-checks')).not.toBeChecked();
  const after = await state(page);
  expect(after.storage).toEqual({ ...before.storage, 'imagecraft-ordered-recipe-v1': JSON.stringify(E.persisted(empty)) });
  expect(after.provider).toBe(before.provider);
  expect(after.tab).toBe(before.tab);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const portable = JSON.parse((await download(page, '#export-recipe')).toString());
  expect(portable.recipe).toEqual(empty);
  expect(E.portableImport(JSON.stringify(portable))).toEqual(empty);
  const entries = untar(await download(page, '#export-folder'));
  expect(Object.keys(entries).sort()).toEqual(['.containerignore', '.dockerignore', '.gitlab-ci.yml', 'Containerfile'].sort());
  expect(entries.Containerfile).toBe(E.containerfile(empty));
  expect(entries['.containerignore']).toBe('**\n!Containerfile\n');
  const event = page.waitForEvent('download');
  await page.locator('#download').click();
  expect(await fs.readFile(await (await event).path(), 'utf8')).toBe(E.containerfile(empty));
  await navigate(page, 'pipeline');
  await expect(page.locator('[data-provider="gitlab"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#pipeline-code')).toHaveText(entries['.gitlab-ci.yml']);
  await expect(page.locator('#pipeline-error')).toBeHidden();
  await navigate(page, 'build');
  await expect(page.locator('#artifact-format')).toHaveValue('raw');
  await expect(page.locator('#artifact-user')).toHaveValue('operator');
  await expect(page.locator('#artifact-code')).toContainText(fixture.image);
  await expect(page.locator('#refresh-help')).toContainText('rhel9/rhel-bootc');
  await expect(page.locator('#build-copy')).toBeEnabled();
  await navigate(page, 'compose');
  await page.reload();
  expect((await state(page)).recipe).toEqual(empty);
  await expect(page.locator('#rows .row')).toHaveCount(0);
  await expect(page.locator('#download')).toBeEnabled();
  expect(await page.evaluate(() => RecipeEngine.errors(recipe))).toEqual([]);
  expect(await page.evaluate(() => containerfile())).toBe(E.containerfile(empty));
  expect((await state(page)).storage).toEqual(after.storage);
  expect(errors).toEqual([]);
});

test('Clear recovers an invalid recipe and Reset still restores its original starter', async ({ page }) => {
  await page.locator('[data-add="command"]').click();
  await expect(page.locator('#download')).toBeDisabled();
  await page.locator('#stage-name').fill('invalid stage');
  await page.locator('#add-stage').click();
  await expect(page.locator('#options-error')).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#clear').click();
  await expect(page.locator('#options-error')).toBeHidden();
  await expect(page.locator('#stage-name')).toHaveValue('');
  await expect(page.locator('#stage-base')).toHaveValue('');
  await expect(page.locator('#download')).toBeEnabled();
  await page.locator('[data-tab="build"]').click();
  await expect(page.locator('#code')).not.toContainText('builder');
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#reset').click();
  expect((await state(page)).recipe).toEqual(empty);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#reset').click();
  expect((await state(page)).recipe).toEqual(E.normalize(await page.evaluate(() => defaults())));
  await expect(page.locator('#rows .row')).toHaveCount(4);
  await expect(page.locator('#recipe-title')).toHaveText('web-server.recipe');
  await expect(page.locator('[data-version="10"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#base-digest')).toHaveValue('');
  expect((await state(page)).provider).toBe('gitlab');
});
