const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test.beforeEach(async ({ page }, testInfo) => {
  await page.addInitScript(mode => localStorage.setItem('imagecraft-color-mode', mode), testInfo.project.name.endsWith('dark') ? 'dark' : 'light');
  await page.goto('/');
});

async function answer(page, name) {
  await page.getByRole('radio', { name, exact: true }).check();
  await page.getByRole('button', { name: 'Continue', exact: false }).click();
}

test('illustrated answers make the RHEL 10 recommendation explicit without choosing for the user', async ({ page }) => {
  await expect(page.locator('.welcome-visual svg')).toHaveCount(4);
  await expect(page.locator('.welcome-badge')).toHaveText(['Web server', 'Podman', 'Toolkit', 'Minimal']);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await answer(page, 'Run containers');
  await expect(page.locator('#welcome-description')).toContainText('RHEL 10 is recommended for new images.');
  const recommended = page.locator('.welcome-option.recommended');
  await expect(recommended.locator('.welcome-badge')).toHaveText('Recommended');
  await expect(recommended.locator('.welcome-visual')).toHaveText('10');
  await expect(recommended.getByRole('radio')).toHaveAccessibleName('RHEL 10');
  await expect(recommended.getByRole('radio')).toHaveAccessibleDescription(/Recommended/);
  await expect(recommended.getByRole('radio')).not.toBeChecked();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('#welcome-step')).toHaveText('QUESTION 2 OF 3');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await answer(page, 'RHEL 10');
  await expect(page.locator('.welcome-visual svg')).toHaveCount(4);
  await expect(page.locator('.welcome-badge')).toHaveText(['QCOW2', 'VMDK', 'Raw disk', 'OCI image']);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(recommended.getByRole('radio')).toBeChecked();
});

test('questions require a choice, preserve answers on Back and do not mutate the recipe', async ({ page }) => {
  const before = await page.evaluate(() => JSON.stringify(recipe));
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('#welcome-step')).toHaveText('QUESTION 1 OF 3');
  await answer(page, 'Run containers');
  await expect(page.locator('#welcome-question')).toBeFocused();
  await answer(page, 'RHEL 9');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'RHEL 9', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Continue' }).click();
  await answer(page, 'VMware vSphere');
  await expect(page.locator('#welcome-summary')).toContainText('Container host');
  await expect(page.locator('#welcome-summary')).toContainText('RHEL 9');
  expect(await page.evaluate(() => JSON.stringify(recipe))).toBe(before);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.locator('.welcome-description').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14);
  expect(await page.locator('#welcome-next').evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Create my recipe' }).click();
  await expect(page.locator('#view-home')).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify(recipe))).toBe(before);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Create my recipe' }).click();
  await expect(page).toHaveURL(/\?view=compose/);
  await expect(page.locator('#recipe-title')).toHaveText('container-host.recipe');
  await expect(page.locator('[data-version="9"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#code')).toContainText('RUN dnf install -y podman');
  await expect(page.locator('#download')).toBeEnabled();
  await page.evaluate(() => navigateView('build'));
  await expect(page.locator('#artifact-format')).toHaveValue('vmdk');
  await expect(page.locator('#artifact-code')).toContainText('vmdk');
});

test('welcome preserves existing files and pins until confirmed, and clears a cross-release pin', async ({ page }) => {
  await page.evaluate(() => {
    recipe.digest = 'sha256:' + 'a'.repeat(64);
    recipe.files = { 'files/keep.txt': 'a2VlcA==' };
  });
  const before = await page.evaluate(() => JSON.stringify(recipe));
  await answer(page, 'Start with a clean base');
  await answer(page, 'RHEL 9');
  await answer(page, 'Decide later');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Create my recipe' }).click();
  expect(await page.evaluate(() => JSON.stringify(recipe))).toBe(before);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Create my recipe' }).click();
  expect(await page.evaluate(() => recipe.digest)).toBe('');
  await expect(page.locator('#base-ref')).toHaveText('registry.redhat.io/rhel9/rhel-bootc:latest');
  await expect(page.locator('#rows .row')).toHaveCount(0);
  await expect(page.locator('#download')).toBeEnabled();
  await page.reload();
  await expect(page.locator('#recipe-title')).toHaveText('minimal-rhel.recipe');
  await expect(page.locator('[data-version="9"]')).toHaveAttribute('aria-pressed', 'true');
});

test('keyboard choices create a web starter without discarding a same-release pin', async ({ page }) => {
  await page.evaluate(() => { recipe.digest = 'sha256:' + 'b'.repeat(64); });
  await page.getByRole('radio', { name: 'Serve a website', exact: true }).focus();
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Continue' }).focus();
  await page.keyboard.press('Enter');
  await answer(page, 'RHEL 10');
  await answer(page, 'A virtual machine');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Create my recipe' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#recipe-title')).toHaveText('web-server.recipe');
  await expect(page.locator('#headline')).toBeFocused();
  expect(await page.evaluate(() => recipe.digest)).toBe('sha256:' + 'b'.repeat(64));
  await expect(page.locator('#code')).toContainText('httpd curl');
  await expect(page.locator('#rows .row')).toHaveCount(3);
  await expect(page.locator('#download')).toBeEnabled();
});
