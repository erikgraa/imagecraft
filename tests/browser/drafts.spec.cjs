const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('node:fs/promises');

const key = 'imagecraft-drafts-v1';
const packages = page => page.getByRole('textbox', { name: 'Package names for step 1', exact: true });
const library = page => page.locator('.sidebar [data-view="drafts"]:visible, .path [data-view="drafts"]:visible').first().click();

test.beforeEach(async ({ page }, testInfo) => {
  await page.addInitScript(mode => localStorage.setItem('imagecraft-color-mode', mode), testInfo.project.name.endsWith('dark') ? 'dark' : 'light');
  await page.goto('/?view=compose');
});

async function saveDraft(page, name, copy = false) {
  await page.getByRole('button', { name: copy ? 'Save as copy' : 'Save draft', exact: true }).click();
  await page.getByRole('textbox', { name: 'Draft name', exact: true }).fill(name);
  await page.getByRole('button', { name: 'Save snapshot', exact: true }).click();
  await expect(page.locator('#draft-dialog')).not.toBeVisible();
}

async function stored(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)).drafts, key);
}

test('standalone Containerfile downloads follow the saved draft name, rename and reload', async ({ page }) => {
  async function downloadAs(filename) {
    await expect(page.locator('#download-filename')).toHaveText(filename);
    const expected = await page.evaluate(() => containerfile());
    const pending = page.waitForEvent('download');
    await page.locator('#download').click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe(filename);
    expect(await fs.readFile(await download.path(), 'utf8')).toBe(expected);
  }
  await saveDraft(page, 'Web baseline');
  await downloadAs('Web baseline.Containerfile');
  await saveDraft(page, 'Production web');
  await downloadAs('Production web.Containerfile');
  await page.reload();
  await downloadAs('Production web.Containerfile');
  await saveDraft(page, 'Release: QA/VM');
  await downloadAs('Release- QA-VM.Containerfile');
  await expect(page.locator('#toast')).toContainText('filename adjusted for filesystem safety');
  await expect(page.locator('#recipe-title')).toHaveText('Release: QA/VM');
  await saveDraft(page, 'CON');
  await downloadAs('draft-CON.Containerfile');
  await expect(page.locator('#toast')).toContainText('filename adjusted for filesystem safety');
});

test('optional package-step comments survive drafts, duplication, reload and Containerfile export', async ({ page }) => {
  const comment = page.getByRole('textbox', { name: 'Comment (optional) for step 1', exact: true });
  await expect(comment).toHaveValue('');
  await comment.fill('HTTP server and health-check tools');
  await expect(comment).toBeFocused();
  await expect(page.locator('#code')).toContainText('# HTTP server and health-check tools');
  const label = await packages(page).evaluate(el => {
    const range = document.createRange();
    range.selectNode(el.parentElement.firstChild);
    return { bottom: range.getBoundingClientRect().bottom, inputTop: el.getBoundingClientRect().top };
  });
  expect(label.inputTop).toBeGreaterThan(label.bottom);
  await saveDraft(page, 'Documented web');
  expect((await stored(page))[0].recipe.rows[0].comment).toBe('HTTP server and health-check tools');
  await page.getByRole('button', { name: 'Duplicate step 1', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Comment (optional) for step 2', exact: true })).toHaveValue('HTTP server and health-check tools');
  await page.reload();
  await expect(comment).toHaveValue('HTTP server and health-check tools');
  const pending = page.waitForEvent('download');
  await page.locator('#download').click();
  const download = await pending;
  expect(await fs.readFile(await download.path(), 'utf8')).toContain('# HTTP server and health-check tools\nRUN dnf install');
  await comment.fill('');
  await expect(page.locator('#rows .row').first()).not.toHaveClass(/invalid/);
});

test('drafts remain easy to reach without a header link and the empty state leads back to the working copy', async ({ page }) => {
  await expect(page.locator('.top [data-view="drafts"]')).toHaveCount(0);
  await packages(page).fill('httpd curl jq');
  await page.getByRole('link', { name: 'Imagecraft home', exact: true }).click();
  await page.getByRole('link', { name: 'My drafts', exact: true }).click();
  const empty = page.getByRole('region', { name: 'No drafts yet', exact: true });
  await expect(empty).toBeVisible();
  await expect(empty.locator('.nav-art')).toBeVisible();
  expect(await empty.getByRole('heading').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(24);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await empty.getByRole('button', { name: 'Go to Compose', exact: true }).click();
  await expect(packages(page)).toHaveValue('httpd curl jq');
  await saveDraft(page, 'First checkpoint');
  await library(page);
  await expect(empty).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'First checkpoint', exact: true })).toBeVisible();
  const before = await page.evaluate(() => JSON.stringify(recipe));
  const start = page.getByRole('button', { name: 'Start a new recipe', exact: true });
  const resume = page.getByRole('button', { name: 'Return to working copy', exact: true });
  await expect(start.locator('svg')).toHaveAttribute('aria-hidden', 'true');
  await expect(resume.locator('svg')).toHaveAttribute('aria-hidden', 'true');
  await resume.click();
  await expect(packages(page)).toHaveValue('httpd curl jq');
  await library(page);
  await start.click();
  await expect(page.locator('#welcome-step')).toHaveText('QUESTION 1 OF 3');
  expect(await page.evaluate(() => JSON.stringify(recipe))).toBe(before);
});

test('named snapshots update explicitly, copy independently and survive reopening and deletion', async ({ page }) => {
  await saveDraft(page, 'Web baseline');
  await packages(page).fill('httpd curl jq');
  expect((await stored(page))[0].recipe.rows[0].value).toBe('httpd curl');
  await expect(page.locator('#draft-status')).toContainText('Changes since');
  await saveDraft(page, 'Web baseline');
  expect(await stored(page)).toHaveLength(1);
  expect((await stored(page))[0].recipe.rows[0].value).toBe('httpd curl jq');
  await packages(page).fill('httpd curl wget');
  await saveDraft(page, 'Web experiment', true);
  expect(await stored(page)).toHaveLength(2);
  await library(page);
  await expect(page.locator('.draft-card')).toHaveCount(2);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Open draft: Web baseline', exact: true }).click();
  expect(await page.evaluate(() => recipe.rows[0].value)).toBe('httpd curl wget');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Open draft: Web baseline', exact: true }).click();
  await expect(packages(page)).toHaveValue('httpd curl jq');
  await packages(page).fill('httpd curl nano');
  await page.reload();
  await expect(packages(page)).toHaveValue('httpd curl nano');
  await library(page);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Open draft: Web baseline', exact: true }).click();
  await expect(packages(page)).toHaveValue('httpd curl jq');
  await library(page);
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Delete draft: Web experiment', exact: true }).click();
  await expect(page.locator('.draft-card')).toHaveCount(2);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete draft: Web experiment', exact: true }).click();
  await expect(page.locator('.draft-card')).toHaveCount(1);
  expect(await page.evaluate(() => recipe.rows[0].value)).toBe('httpd curl jq');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Web baseline', exact: true })).toBeVisible();
});

test('starter replacement creates a separate working copy and the save dialog is accessible', async ({ page }) => {
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Draft name' })).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeFocused();
  await saveDraft(page, 'Original');
  await page.evaluate(() => navigateView('templates'));
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Use template: Minimal RHEL', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save as copy' })).toBeHidden();
  await saveDraft(page, 'Minimal');
  const drafts = await stored(page);
  expect(drafts).toHaveLength(2);
  expect(drafts.find(draft => draft.name === 'Original').recipe.rows).toHaveLength(4);
  expect(drafts.find(draft => draft.name === 'Minimal').recipe.rows).toHaveLength(0);
});

test('drafts preserve pins and stages, allow unfinished steps, and explicitly exclude file bytes', async ({ page }) => {
  await page.evaluate(() => navigateView('templates'));
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Use template: Local service unit', exact: true }).click();
  await page.evaluate(() => {
    recipe.version = '9';
    recipe.digest = 'sha256:' + 'a'.repeat(64);
    recipe.stages = [{ name: 'builder', base: 'quay.io/example/builder:latest' }];
    recipe.rows.push({ id: 'unfinished', type: 'command', value: '' });
    changed();
  });
  const files = await page.evaluate(() => JSON.stringify(recipe.files));
  await saveDraft(page, 'Local service');
  expect(await page.evaluate(() => JSON.stringify(recipe.files))).toBe(files);
  const [draft] = await stored(page);
  expect(draft.recipe.files).toEqual({});
  await page.reload();
  await library(page);
  await expect(page.locator('.draft-library-note')).toContainText('Attached file bytes are not saved');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Open draft: Local service', exact: true }).click();
  expect(await page.evaluate(() => recipe.digest)).toBe('sha256:' + 'a'.repeat(64));
  expect(await page.evaluate(() => recipe.stages[0].name)).toBe('builder');
  await expect(page.locator('[data-version="9"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#warning')).toContainText('Select the referenced local file again');
  await expect(page.locator('#download')).toBeDisabled();
  await expect(page.getByRole('textbox', { name: 'command value for step 3', exact: true })).toHaveValue('');
});

test('storage failures and possible credentials cannot overwrite an existing draft', async ({ page }) => {
  await saveDraft(page, 'Safe checkpoint');
  const before = await page.evaluate(key => localStorage.getItem(key), key);
  await packages(page).fill('httpd curl jq');
  await page.evaluate(key => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException('Storage full', 'QuotaExceededError');
      return setItem.call(this, name, value);
    };
  }, key);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.getByRole('button', { name: 'Save snapshot', exact: true }).click();
  await expect(page.locator('#draft-save-error')).toContainText('Storage full');
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(before);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.evaluate(() => { recipe.rows[1].value = 'echo password=sensitive-value'; });
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.getByRole('button', { name: 'Save snapshot', exact: true }).click();
  await expect(page.locator('#draft-save-error')).toContainText('Possible credentials');
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(before);
});

test('changed or malformed draft storage is surfaced without silently replacing it', async ({ page }) => {
  await saveDraft(page, 'Shared checkpoint');
  await page.evaluate(key => {
    const library = JSON.parse(localStorage.getItem(key));
    library.drafts[0].updatedAt++;
    library.drafts[0].recipe.rows[0].value = 'curl jq';
    localStorage.setItem(key, JSON.stringify(library));
  }, key);
  await packages(page).fill('httpd curl wget');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.getByRole('button', { name: 'Save snapshot', exact: true }).click();
  await expect(page.locator('#draft-save-error')).toContainText('changed or was deleted in another tab');
  expect((await stored(page))[0].recipe.rows[0].value).toBe('curl jq');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await saveDraft(page, 'Independent copy', true);
  expect(await stored(page)).toHaveLength(2);
  await page.evaluate(key => localStorage.setItem(key, '{malformed'), key);
  await library(page);
  await expect(page.locator('#draft-error')).toContainText('Cannot read drafts');
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe('{malformed');
});
