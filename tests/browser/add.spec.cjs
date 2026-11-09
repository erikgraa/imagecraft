const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('node:fs/promises');
const E = require('../../public/recipe-engine.js');

const field = (page, label, step) => page.getByRole('textbox', { name: `${label} for step ${step}`, exact: true });
const archive = Buffer.from(E.tar([{ path: 'payload/config', bytes: new Uint8Array([0, 255, 42]) }]));

async function addLocal(page, step, name, bytes, destination, mode = '0644') {
  await page.locator('[data-add="add"]').click();
  await field(page, 'Absolute destination file or directory', step).fill(destination);
  await field(page, 'Octal permissions', step).fill(mode);
  await page.getByLabel(`Local file for step ${step}`, { exact: true }).setInputFiles({ name, mimeType: 'application/octet-stream', buffer: bytes });
  await expect(field(page, 'Build-context source', step)).toHaveValue('files/' + name);
}

async function download(page, selector, path) {
  const event = page.waitForEvent('download');
  await page.locator(selector).click();
  const result = await event;
  await result.saveAs(path);
  return fs.readFile(path);
}

function contextFiles(tar) {
  const result = new Map();
  let offset = 0;
  const string = (start, length) => tar.subarray(start, start + length).toString().split('\0')[0];
  while (tar[offset]) {
    const name = string(offset, 100), prefix = string(offset + 345, 155), size = parseInt(string(offset + 124, 12), 8);
    result.set(prefix ? prefix + '/' + name : name, tar.subarray(offset + 512, offset + 512 + size));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return result;
}

async function audit(page) {
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test.beforeEach(async ({ page }, testInfo) => {
  await page.addInitScript(mode => localStorage.setItem('imagecraft-color-mode', mode), testInfo.project.name.endsWith('dark') ? 'dark' : 'light');
  page.on('dialog', dialog => dialog.accept());
  await page.goto('/?view=compose');
});

test('ADD local file/archive and HTTPS preserve exact exports and reload/import semantics without network access', async ({ page }, testInfo) => {
  const externalRequests = [];
  await page.route('https://example.com/**', route => { externalRequests.push(route.request().url()); return route.abort(); });
  await addLocal(page, 5, 'example.conf', Buffer.from('mode=example\n'), '/etc/example.conf');
  await addLocal(page, 6, 'bundle.tar', archive, '/usr/share/example/', '0755');
  await page.locator('[data-add="add"]').click();
  await page.getByLabel('ADD source kind for step 7', { exact: true }).selectOption('https');
  const url = 'https://example.com/release%20bundle.tar.gz?flavor=a&mirror=b;v=1';
  await field(page, 'HTTPS source URL', 7).fill(url);
  await field(page, 'Absolute destination file or directory', 7).fill('/usr/share/release.tar.gz');
  await expect(page.getByLabel('Local file for step 7', { exact: true })).toHaveCount(0);
  await expect(page.locator('#download')).toBeEnabled();
  await expect(page.locator('#code')).toContainText('ADD --chmod=0644 ["files/example.conf","/etc/example.conf"]');
  await expect(page.locator('#code')).toContainText('ADD --chmod=0755 ["files/bundle.tar","/usr/share/example/"]');
  await expect(page.locator('#code')).toContainText('ADD --chmod=0644 ' + JSON.stringify([url, '/usr/share/release.tar.gz']));
  await expect(page.locator('#rows .row.add').last()).toContainText('AT BUILD TIME');
  await audit(page);
  await page.screenshot({ path: testInfo.outputPath('add-variants.png'), fullPage: true });
  await page.locator('.recipe-options summary').click();
  const jsonPath = testInfo.outputPath('add-recipe.json');
  const portable = JSON.parse((await download(page, '#export-recipe', jsonPath)).toString());
  const entries = contextFiles(await download(page, '#export-folder', testInfo.outputPath('add-context.tar')));
  expect(entries.get('files/bundle.tar')).toEqual(archive);
  expect(entries.get('files/example.conf').toString()).toBe('mode=example\n');
  expect(entries.has('payload/config')).toBe(false);
  expect(entries.get('.containerignore').toString()).toContain('!files/bundle.tar');
  expect(entries.get('Containerfile').toString()).toContain(JSON.stringify([url, '/usr/share/release.tar.gz']));
  expect(Object.keys(portable.recipe.files)).toEqual(['files/example.conf', 'files/bundle.tar']);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('imagecraft-ordered-recipe-v1')));
  expect(stored.files).toEqual({});
  await page.reload();
  await expect(page.locator('#warning')).toContainText('Select the referenced local file again');
  await expect(page.locator('#download')).toBeDisabled();
  await expect(field(page, 'HTTPS source URL', 7)).toHaveValue(url);
  await page.locator('.recipe-options summary').click();
  await page.locator('#recipe-file').setInputFiles(jsonPath);
  await expect(page.locator('#download')).toBeEnabled();
  expect(await page.evaluate(() => recipe)).toEqual(portable.recipe);
  expect(externalRequests).toEqual([]);
  await audit(page);
});

test('ADD validation, source switching, duplicate/reorder/remove and shared COPY bytes remain accessible', async ({ page }) => {
  await addLocal(page, 5, 'shared.conf', Buffer.from('shared\n'), '/etc/add.conf');
  await page.locator('[data-add="copy"]').click();
  await field(page, 'Build-context source', 6).fill('files/shared.conf');
  await field(page, 'Absolute destination file', 6).fill('/etc/copy.conf');
  await expect(page.locator('#download')).toBeEnabled();
  await page.getByRole('button', { name: 'Duplicate step 5', exact: true }).click();
  await expect(field(page, 'Build-context source', 6)).toBeFocused();
  await page.getByRole('button', { name: 'Reorder step 6: drag or use Up and Down arrow keys', exact: true }).focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('button', { name: 'Reorder step 5: drag or use Up and Down arrow keys', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Remove step 6', exact: true }).click();
  await page.getByLabel('ADD source kind for step 5', { exact: true }).selectOption('https');
  expect(await page.evaluate(() => Object.keys(recipe.files))).toEqual(['files/shared.conf']);
  await field(page, 'HTTPS source URL', 5).fill('http://example.com/file');
  await expect(field(page, 'HTTPS source URL', 5)).toHaveAttribute('aria-invalid', 'true');
  await expect(field(page, 'HTTPS source URL', 5)).toHaveAttribute('aria-describedby', /note-/);
  await expect(page.locator('#warning')).toContainText('valid HTTPS file URL');
  await expect(page.locator('#download')).toBeDisabled();
  await expect(page.locator('#build-copy')).toBeDisabled();
  await expect(page.locator('#artifact-download')).toBeEnabled();
  await audit(page);
  await field(page, 'HTTPS source URL', 5).fill('https://example.com/repo.git');
  await expect(page.locator('#download')).toBeDisabled();
  await field(page, 'HTTPS source URL', 5).fill('https://example.com/file');
  await field(page, 'Octal permissions', 5).fill('0777 --link');
  await expect(page.locator('#download')).toBeDisabled();
  await field(page, 'Octal permissions', 5).fill('0644');
  await field(page, 'Absolute destination file or directory', 5).fill('/etc/../evil/');
  await expect(page.locator('#download')).toBeDisabled();
  await field(page, 'Absolute destination file or directory', 5).fill('/etc/remote.conf');
  await expect(page.locator('#download')).toBeEnabled();
  await expect(page.locator('#build-copy')).toBeEnabled();
  await expect(page.locator('#artifact-download')).toBeEnabled();
  await expect(page.locator('#code')).toContainText('COPY --chmod=0644 ["files/shared.conf","/etc/copy.conf"]');
  await page.getByLabel('ADD source kind for step 5', { exact: true }).selectOption('local');
  await field(page, 'Build-context source', 5).fill('files/shared.conf');
  await expect(page.locator('#download')).toBeEnabled();
  await field(page, 'Build-context source', 5).fill('files/renamed.conf');
  expect(await page.evaluate(() => Object.keys(recipe.files).sort())).toEqual(['files/renamed.conf', 'files/shared.conf']);
  await page.getByRole('button', { name: 'Remove step 5', exact: true }).click();
  expect(await page.evaluate(() => Object.keys(recipe.files))).toEqual(['files/shared.conf']);
  await expect(page.locator('#download')).toBeEnabled();
  await audit(page);
});

test('ADD works in an earlier builder with a reviewed OS pin and one final lint', async ({ page }) => {
  await page.locator('.recipe-options summary').click();
  await page.locator('#base-digest').fill('sha256:' + 'a'.repeat(64));
  await page.locator('#apply-digest').click();
  await page.locator('#stage-name').fill('builder');
  await page.locator('#stage-base').fill('quay.io/acme/builder:v1');
  await page.locator('#add-stage').click();
  await addLocal(page, 5, 'bundle.tar', archive, '/out/', '0755');
  await page.getByLabel('Target stage for step 5', { exact: true }).selectOption('builder');
  await expect(page.locator('#warning')).toContainText('Order builder steps');
  await page.getByRole('button', { name: 'Reorder step 5: drag or use Up and Down arrow keys', exact: true }).focus();
  for (let index = 0; index < 4; index++) await page.keyboard.press('ArrowUp');
  await expect(page.locator('#download')).toBeEnabled();
  const code = await page.locator('#code').innerText();
  expect(code.indexOf('ADD --chmod=0755')).toBeLessThan(code.indexOf(' AS os'));
  expect(code).toContain('@sha256:' + 'a'.repeat(64));
  expect(code.match(/RUN bootc container lint/g)).toHaveLength(1);
  await audit(page);
});
