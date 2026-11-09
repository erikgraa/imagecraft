const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('node:fs/promises');
const path = require('node:path');
const RecipeEngine = require(path.join(__dirname, '..', '..', 'public', 'recipe-engine.js'));

async function audit(page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}
async function section(page, name) {
  const buttons = page.locator(`[data-view="${name}"]`);
  for (const button of await buttons.all()) {
    if (await button.isVisible()) { await button.click(); return; }
  }
  throw new Error(`No visible navigation to ${name}`);
}
async function fitsViewport(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test.beforeEach(async ({ page }, testInfo) => {
  await page.addInitScript(mode => localStorage.setItem('imagecraft-color-mode', mode), testInfo.project.name.endsWith('dark') ? 'dark' : 'light');
  await page.goto('/?view=compose');
  await expect(page.locator('#view-compose')).toBeVisible();
  await expect(page.locator('#rows .row')).toHaveCount(4);
});

test('initial composition, skip link, theme controls and preview semantics', async ({ page }, testInfo) => {
  await expect(page.locator('body')).toHaveAttribute('data-color-mode', testInfo.project.name.endsWith('dark') ? 'dark' : 'light');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to current section' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#headline')).toBeFocused();
  await expect(page.locator('[data-version="10"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-tab="container"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-tab="build"]').click();
  await expect(page.locator('[data-tab="build"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#code')).toContainText('podman build');
  await page.locator('[data-tab="container"]').click();
  const mode = testInfo.project.name.endsWith('dark') ? 'dark' : 'light';
  await page.locator(`[data-mode="${mode === 'dark' ? 'light' : 'dark'}"]`).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-color-mode', mode === 'dark' ? 'light' : 'dark');
  await page.locator(`[data-mode="${mode}"]`).click();
  await expect(page.locator(`[data-mode="${mode}"]`)).toHaveAttribute('aria-pressed', 'true');
  await fitsViewport(page);
  await audit(page);
  await page.screenshot({ path: testInfo.outputPath('compose.png'), fullPage: true });
});

test('keyboard reordering, boundaries, duplicate and deletion preserve focus', async ({ page }) => {
  const firstId = await page.locator('#rows .row').first().getAttribute('data-id');
  await page.locator('#rows .drag-handle').first().focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#rows .row').first()).toHaveAttribute('data-id', firstId);
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#rows .row').nth(1)).toHaveAttribute('data-id', firstId);
  await expect(page.locator('#rows .drag-handle').nth(1)).toBeFocused();
  await expect(page.locator('#reorder-status')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('#reorder-status')).toContainText('position 2 of 4');
  await expect(page.locator('#code .active-instruction')).not.toHaveCount(0);
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('button', { name: 'Move step 1 up', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Move step 4 down', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Duplicate step 1', exact: true }).click();
  await expect(page.locator('#rows .row')).toHaveCount(5);
  await expect(page.getByRole('textbox', { name: 'packages value for step 2', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Remove step 2', exact: true }).click();
  await expect(page.locator('#rows .row')).toHaveCount(4);
  await expect(page.getByRole('textbox', { name: 'command value for step 2', exact: true })).toBeFocused();
  await audit(page);
});

test('expanded options, COPY files, builder controls and persistent errors', async ({ page }, testInfo) => {
  await page.locator('summary').focus();
  await page.keyboard.press('Enter');
  for (const id of ['export-folder', 'export-recipe', 'import-recipe', 'base-digest']) {
    await page.keyboard.press('Tab');
    await expect(page.locator(`#${id}`)).toBeFocused();
  }
  await page.locator('#apply-digest').click();
  await expect(page.locator('#options-error')).toHaveAttribute('role', 'alert');
  await expect(page.locator('#options-error')).toContainText('64 lowercase');
  await expect(page.locator('#base-digest')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#base-digest')).toHaveAttribute('aria-describedby', 'options-error');
  await audit(page);
  await page.locator('#stage-name').fill('builder');
  await page.locator('#stage-base').fill('registry.redhat.io/rhel10/rhel-bootc:latest');
  await page.locator('#add-stage').click();
  await expect(page.locator('#options-error')).toBeHidden();
  await expect(page.locator('#stage-summary')).toContainText('builder');
  await expect(page.getByRole('combobox', { name: 'Target stage for step 1' })).toBeVisible();
  await page.locator('[data-add="copy"]').click();
  await expect(page.getByRole('textbox', { name: 'Build-context source for step 5' })).toBeFocused();
  await expect(page.locator('#warning')).toHaveAttribute('role', 'alert');
  await expect(page.locator('#download')).toBeDisabled();
  await page.getByRole('textbox', { name: 'Absolute destination file for step 5' }).fill('/etc/example.conf');
  await page.getByRole('textbox', { name: 'Build-context source for step 5' }).fill('files/example.conf');
  await page.locator('summary').click();
  await page.getByRole('textbox', { name: 'Build-context source for step 5' }).fill('files/../bad.conf');
  await page.getByLabel('Local file for step 5', { exact: true }).setInputFiles({ name: 'bad.conf', mimeType: 'text/plain', buffer: Buffer.from('not accepted') });
  await expect(page.locator('#options-error')).toBeVisible();
  await expect(page.getByLabel('Local file for step 5', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Local file for step 5', { exact: true })).toHaveAttribute('aria-describedby', 'options-error');
  await page.getByRole('textbox', { name: 'Build-context source for step 5' }).fill('files/example.conf');
  await page.getByLabel('Local file for step 5', { exact: true }).setInputFiles({ name: 'example.conf', mimeType: 'text/plain', buffer: Buffer.from('mode=example\n') });
  await expect(page.locator('#warning')).toBeHidden();
  await expect(page.locator('#download')).toBeEnabled();
  await expect(page.getByLabel('Local file for step 5', { exact: true })).toHaveAttribute('aria-describedby', /note-/);
  await expect(page.locator('#options-error')).toBeHidden();
  await page.locator('summary').click();
  await page.locator('#local-checks').check();
  await expect(page.locator('#review-notes')).toContainText('Package availability is NOT verified');
  await fitsViewport(page);
  await audit(page);
  await page.screenshot({ path: testInfo.outputPath('options.png'), fullPage: true });
  await page.reload();
  await expect(page.locator('#warning')).toContainText('Select the referenced local file again');
  await expect(page.locator('#download')).toBeDisabled();
});

test('guided views, provider controls and templates remain keyboard reachable', async ({ page }, testInfo) => {
  for (const name of ['learn', 'build', 'pipeline', 'templates']) {
    await section(page, name);
    await expect(page.locator('#headline')).toBeFocused();
    await expect(page.locator(`#view-${name}`)).toBeVisible();
    await expect(page.locator('#view-compose')).toBeHidden();
    await expect(page.locator('.projectbar')).toBeHidden();
    await fitsViewport(page);
    if (name === 'pipeline') {
      for (const provider of ['github', 'gitlab', 'azure']) {
        await page.locator(`[data-provider="${provider}"]`).focus();
        await page.keyboard.press('Enter');
        await expect(page.locator(`[data-provider="${provider}"]`)).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('#pipeline-code')).not.toBeEmpty();
        await audit(page);
      }
    } else await audit(page);
  }
  await expect(page.locator('.template-card')).toHaveCount(6);
  if (testInfo.project.name.startsWith('mobile')) {
    expect(await page.locator('.template-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(1);
  }
  await page.screenshot({ path: testInfo.outputPath('templates.png'), fullPage: true });
  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-template="service-file"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#view-compose')).toBeVisible();
  await expect(page.locator('#headline')).toBeFocused();
  await expect(page.locator('#rows .row')).toHaveCount(2);
  await expect(page.locator('#code')).toContainText('COPY --chmod=0644');
  await audit(page);
});

test('invalid image and imports expose errors without losing existing recipe', async ({ page }) => {
  await page.locator('#registry').fill('not an image');
  await expect(page.locator('#registry')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#registry')).toHaveAttribute('aria-describedby', 'warning');
  await expect(page.locator('#warning')).toBeVisible();
  await section(page, 'pipeline');
  await expect(page.locator('#pipeline-error')).toHaveAttribute('role', 'alert');
  await expect(page.locator('#pipeline-download')).toBeDisabled();
  await audit(page);
  await section(page, 'compose');
  await page.locator('#registry').fill('quay.io/acme/web-server:latest');
  await page.locator('summary').click();
  await page.locator('#recipe-file').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"imagecraft-recipe","schemaVersion":999}') });
  await expect(page.locator('#options-error')).toContainText('Import rejected: Unsupported');
  await expect(page.locator('#rows .row')).toHaveCount(4);
  await expect(page.locator('#options-error')).toBeVisible();
  await audit(page);
});

test('actual exports and portable import preserve local bytes and reviewed pins', async ({ page }, testInfo) => {
  page.on('dialog', dialog => dialog.accept());
  await section(page, 'templates');
  await page.getByRole('button', { name: 'Use template: Local service unit', exact: true }).click();
  await page.locator('summary').click();
  await page.locator('#base-digest').fill('sha256:' + 'a'.repeat(64));
  await page.locator('#apply-digest').click();
  await expect(page.locator('#pin-status')).toHaveAttribute('role', 'status');
  await expect(page.locator('#pin-status')).toContainText('sha256:' + 'a'.repeat(64));
  await page.locator('[data-version="9"]').click();
  await expect(page.locator('#pin-status')).toContainText('Unpinned');
  await expect(page.locator('[data-version="9"]')).toHaveAttribute('aria-pressed', 'true');
  const jsonPending = page.waitForEvent('download');
  await page.locator('#export-recipe').click();
  const jsonDownload = await jsonPending;
  const jsonPath = testInfo.outputPath('portable.recipe.json');
  await jsonDownload.saveAs(jsonPath);
  const serialized = await fs.readFile(jsonPath, 'utf8');
  const imported = RecipeEngine.portableImport(serialized);
  expect(imported.version).toBe('9');
  expect(imported.rows).toHaveLength(2);
  expect(Object.keys(imported.files)).toEqual(['files/imagecraft-hello.service']);
  expect(Buffer.from(imported.files['files/imagecraft-hello.service'], 'base64').toString()).toContain('ExecStart=/usr/bin/echo');
  const tarPending = page.waitForEvent('download');
  await page.locator('#export-folder').click();
  const tarDownload = await tarPending;
  const tarPath = testInfo.outputPath('imagecraft-build.tar');
  await tarDownload.saveAs(tarPath);
  const tar = await fs.readFile(tarPath);
  expect(tar.subarray(257, 262).toString()).toBe('ustar');
  expect(tar.toString()).toContain('files/imagecraft-hello.service');
  expect(tar.toString()).toContain('.containerignore');
  expect(tar.toString()).toContain('.github/workflows/build-image.yml');
  await page.locator('#reset').click();
  await expect(page.locator('#rows .row')).toHaveCount(4);
  await page.locator('#recipe-file').setInputFiles(jsonPath);
  await expect(page.locator('#rows .row')).toHaveCount(2);
  await expect(page.locator('#download')).toBeEnabled();
  await expect(page.locator('#toast')).toContainText('Imported locally');
  await audit(page);
});
