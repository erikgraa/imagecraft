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

test('image map separates builder contents, updates live and copies the complete Containerfile', async ({ page }) => {
  await page.evaluate(() => {
    recipe.stages = [{ name: 'tools', base: 'quay.io/example/builder:latest' }];
    recipe.rows = [
      { id: 'builder-packages', type: 'packages', value: 'make gcc', stage: 'tools' },
      { id: 'final-packages', type: 'packages', value: 'curl jq' },
      { id: 'notice', type: 'copy', value: '', source: 'files/notice.txt', destination: '/usr/share/notice.txt', mode: '0644' },
      { id: 'tool', type: 'artifact', value: '', from: 'tools', source: '/output/tool', destination: '/usr/bin/tool', mode: '0755' },
      { id: 'guest', type: 'service', value: 'vmtoolsd' },
      { id: 'archive', type: 'add', value: '', sourceKind: 'https', source: 'https://example.com/download.zip', destination: '/usr/share/downloads/', mode: '0644' }
    ];
    recipe.files = { 'files/notice.txt': 'aGVsbG8=' };
    changed();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copiedMap = text; } } });
  });
  await page.locator('[data-tab="map"]').click();
  const map = page.getByRole('region', { name: 'Visual recipe plan', exact: true });
  const os = map.getByRole('region', { name: 'Final OS recipe plan', exact: true });
  await expect(map).toContainText('not an inventory');
  await expect(os.locator('.map-packages span')).toHaveText(['curl', 'jq']);
  await expect(os).not.toContainText('make gcc');
  await expect(os.locator('[data-row-id="notice"]')).toContainText('Local file selected');
  await expect(os.locator('[data-row-id="tool"]')).toContainText('tools: /output/tool');
  await expect(os.locator('[data-row-id="tool"]')).toContainText('/usr/bin/tool');
  await expect(os.locator('[data-row-id="guest"]')).toContainText('not started during the build');
  await expect(os.locator('[data-row-id="archive"]')).toContainText('not fetched here');
  await map.locator('.map-builder > summary').click();
  await expect(map.locator('.map-builder .map-packages span')).toHaveText(['make', 'gcc']);
  await audit(page);
  await fitsViewport(page);
  await page.locator('#compose-steps > summary').click();
  await map.getByRole('button', { name: 'Edit step 2: Install packages', exact: true }).focus();
  await page.keyboard.press('Enter');
  const packages = page.getByRole('textbox', { name: 'Package names for step 2', exact: true });
  await expect(packages).toBeFocused();
  await packages.fill('curl wget');
  await expect(os.locator('.map-packages span')).toHaveText(['curl', 'wget']);
  await page.getByRole('button', { name: 'Copy Containerfile', exact: true }).click();
  expect(await page.evaluate(() => window.copiedMap)).toBe(await page.evaluate(() => containerfile()));
  await page.reload();
  await page.locator('[data-tab="map"]').click();
  await expect(os.locator('[data-row-id="notice"]')).toContainText(/Needs attention.*file/i);
  await expect(page.getByRole('button', { name: 'Copy Containerfile', exact: true })).toBeDisabled();
});

test('image map renders recipe text safely and does not hide stage-order errors', async ({ page }) => {
  await page.evaluate(() => {
    recipe.stages = [{ name: 'tools', base: 'quay.io/example/builder:latest' }];
    recipe.rows = [
      { id: 'final', type: 'command', value: 'echo "<img src=x onerror=alert(1)>"' },
      { id: 'builder', type: 'packages', value: 'make gcc', stage: 'tools' }
    ];
    changed();
  });
  await page.locator('[data-tab="map"]').click();
  await expect(page.locator('#image-map')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#image-map img')).toHaveCount(0);
  await expect(page.locator('#warning')).toBeVisible();
  await expect(page.locator('#warning')).toContainText(/stage/i);
  await expect(page.getByRole('button', { name: 'Copy Containerfile', exact: true })).toBeDisabled();
  await fitsViewport(page);
});

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
  const themeToggle = page.getByRole('button', { name: 'Dark mode', exact: true });
  await themeToggle.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-color-mode', mode === 'dark' ? 'light' : 'dark');
  await themeToggle.click();
  await expect(themeToggle).toHaveAttribute('aria-pressed', String(mode === 'dark'));
  await fitsViewport(page);
  await audit(page);
  await page.screenshot({ path: testInfo.outputPath('compose.png'), fullPage: true });
});

test('workspace is centered and illustrated navigation stays usable across widths', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const frame = await page.locator('.layout').boundingBox();
  expect(frame.width).toBeGreaterThan(1360);
  expect(frame.width).toBeLessThanOrEqual(1440);
  expect(frame.x).toBeGreaterThan(200);
  expect(Math.abs(frame.x - (1920 - frame.x - frame.width))).toBeLessThan(2);
  const links = page.locator('.sidebar [data-view]');
  for (const link of await links.all()) {
    const art = link.locator('.nav-art');
    await expect(art).toBeVisible();
    await expect(art).toHaveAttribute('aria-hidden', 'true');
    expect((await art.boundingBox()).width).toBeGreaterThanOrEqual(48);
    expect((await link.boundingBox()).height).toBeGreaterThanOrEqual(64);
  }
  await links.filter({ hasText: 'Build & deploy' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.sidebar [data-view="build"]')).toHaveAttribute('aria-current', 'page');
  await page.locator('.build-steps [data-build-step="install"]').click();
  const warning = page.getByRole('note', { name: 'Warning: privileged artifact build' });
  await expect(warning).toBeVisible();
  const style = await warning.evaluate(el => ({
    border: parseFloat(getComputedStyle(el).borderLeftWidth),
    heading: parseFloat(getComputedStyle(el.querySelector('strong')).fontSize),
    text: parseFloat(getComputedStyle(el.querySelector('p')).fontSize),
  }));
  expect(style.border).toBeGreaterThanOrEqual(5);
  expect(style.heading).toBeGreaterThanOrEqual(16);
  expect(style.text).toBeGreaterThanOrEqual(14);
  for (const width of [1024, 820, 601, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await fitsViewport(page);
    await expect(warning).toBeVisible();
  }
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.locator('.path [data-view="compose"]')).toBeVisible();
  await section(page, 'compose');
  await fitsViewport(page);
  await audit(page);
});

test('Compose sections collapse independently without losing recipe edits', async ({ page }) => {
  const image = page.getByRole('textbox', { name: 'Image reference', exact: true });
  await image.fill('ghcr.io/example/folded:v1');
  const original = await page.evaluate(() => JSON.stringify(recipe));
  for (const [id, content] of [
    ['compose-settings', '#registry'],
    ['compose-steps', '#rows'],
    ['compose-preview', '#code'],
  ]) {
    const summary = page.locator(`#${id} > summary`);
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator(`#${id}`)).not.toHaveAttribute('open', '');
    await expect(page.locator(content)).toBeHidden();
    await expect(summary).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.locator(content)).toBeVisible();
    expect(await page.evaluate(() => JSON.stringify(recipe))).toBe(original);
  }
  const help = page.locator('.order-help');
  await expect(help.locator('p')).toBeHidden();
  expect((await help.boundingBox()).height).toBeLessThanOrEqual(50);
  await help.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(help.locator('p')).toBeVisible();
  await expect(image).toHaveValue('ghcr.io/example/folded:v1');
  await fitsViewport(page);
  await audit(page);
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
  await expect(page.getByRole('textbox', { name: 'Package names for step 2', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Remove step 2', exact: true }).click();
  await expect(page.locator('#rows .row')).toHaveCount(4);
  await expect(page.getByRole('textbox', { name: 'command value for step 2', exact: true })).toBeFocused();
  await audit(page);
});

test('downloads stay visible outside collapsed Compose sections and explain validation failures', async ({ page }) => {
  const before = await page.evaluate(() => JSON.stringify(recipe));
  for (const id of ['compose-settings', 'compose-steps', 'compose-preview']) {
    await page.locator('#' + id + ' > summary').click();
  }
  const downloads = page.getByRole('region', { name: 'Take your recipe with you', exact: true });
  await expect(downloads).toBeVisible();
  for (const name of ['Download build folder', 'Download Containerfile', 'Download portable recipe']) {
    const button = downloads.getByRole('button', { name, exact: true });
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
    expect(await button.evaluate(el => el.closest('details'))).toBeNull();
  }
  await expect(downloads.locator('#export-folder')).toHaveClass(/primary/);
  await expect(downloads).toContainText('Local COPY and ADD files are not included');
  await expect(downloads).toContainText('exports are not encrypted');
  expect(await page.evaluate(() => JSON.stringify(recipe))).toBe(before);
  await audit(page);
  await page.locator('#compose-settings > summary').click();
  await page.locator('#registry').fill('not an image reference');
  for (const id of ['export-folder', 'download', 'export-recipe']) {
    await expect(downloads.locator('#' + id)).toBeDisabled();
  }
  await expect(downloads.getByRole('status')).toHaveText('Fix recipe errors above to enable downloads.');
  await page.locator('#registry').fill('quay.io/example/my-os:v1');
  for (const id of ['export-folder', 'download', 'export-recipe']) {
    await expect(downloads.locator('#' + id)).toBeEnabled();
  }
  await expect(downloads.getByRole('status')).toContainText('Ready to download');
});

test('expanded options, COPY files, builder controls and persistent errors', async ({ page }, testInfo) => {
  await page.locator('.recipe-options > summary').focus();
  await page.keyboard.press('Enter');
  for (const id of ['import-recipe', 'base-digest']) {
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
  await page.locator('.recipe-options > summary').click();
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
  await page.locator('.recipe-options > summary').click();
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

test('image reference supports normal typing, updates build commands and survives reload', async ({ page }) => {
  const image = page.getByRole('textbox', { name: 'Image reference', exact: true });
  expect((await image.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await image.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
  await expect(image).toBeFocused();
  await expect(image).toHaveAttribute('aria-invalid', 'true');
  await image.pressSequentially('ghcr.io/example/diagnostics:v1');
  await expect(image).toHaveValue('ghcr.io/example/diagnostics:v1');
  await expect(image).toHaveAttribute('aria-invalid', 'false');
  await expect(image).toBeFocused();
  expect(await page.evaluate(() => recipe.image)).toBe('ghcr.io/example/diagnostics:v1');
  await page.locator('[data-tab="build"]').click();
  await expect(page.locator('#code')).toContainText('podman build -t ghcr.io/example/diagnostics:v1 .');
  await page.reload();
  await expect(image).toHaveValue('ghcr.io/example/diagnostics:v1');
  await section(page, 'build');
  await expect(page.locator('#build-code')).toContainText('podman push ghcr.io/example/diagnostics:v1');
});

test('invalid image and imports expose errors without losing existing recipe', async ({ page }) => {
  await page.locator('#registry').fill('not an image');
  await expect(page.locator('#registry')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#registry')).toHaveAttribute('aria-describedby', 'registry-help warning');
  await expect(page.locator('#warning')).toBeVisible();
  await section(page, 'pipeline');
  await expect(page.locator('#pipeline-error')).toHaveAttribute('role', 'alert');
  await expect(page.locator('#pipeline-download')).toBeDisabled();
  await audit(page);
  await section(page, 'compose');
  await page.locator('#registry').fill('quay.io/acme/web-server:latest');
  await page.locator('.recipe-options > summary').click();
  await page.locator('#recipe-file').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"imagecraft-recipe","schemaVersion":999}') });
  await expect(page.locator('#options-error')).toContainText('Import rejected: Unsupported');
  await expect(page.locator('#rows .row')).toHaveCount(4);
  await page.locator('#compose-settings > summary').click();
  await expect(page.locator('#options-error')).toBeVisible();
  await audit(page);
});

test('actual exports and portable import preserve local bytes and reviewed pins', async ({ page }, testInfo) => {
  page.on('dialog', dialog => dialog.accept());
  await section(page, 'templates');
  await page.getByRole('button', { name: 'Use template: Local service unit', exact: true }).click();
  await page.locator('.recipe-options > summary').click();
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
