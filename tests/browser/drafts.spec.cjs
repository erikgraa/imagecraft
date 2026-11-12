const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const key = 'imagecraft-drafts-v1';
const packages = page => page.getByRole('textbox', { name: 'packages value for step 1', exact: true });
const library = page => page.getByRole('link', { name: 'My drafts', exact: true }).click();

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
