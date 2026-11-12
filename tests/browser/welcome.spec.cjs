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

for (const review of [false, true]) {
  test(`reset from ${review ? 'starting-point review' : 'question 3'} clears answers without changing the working copy`, async ({ page }) => {
    const before = await page.evaluate(() => ({ recipe: JSON.stringify(recipe), storage: JSON.stringify(localStorage) }));
    await expect(page.getByRole('button', { name: 'Reset', exact: true })).toBeHidden();
    await answer(page, 'Run containers');
    await answer(page, 'RHEL 9');
    if (review) await answer(page, 'VMware vSphere');
    const reset = page.getByRole('button', { name: 'Reset', exact: true });
    await expect(reset.locator('svg')).toHaveAttribute('aria-hidden', 'true');
    await reset.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#welcome-step')).toHaveText('QUESTION 1 OF 3');
    await expect(page.locator('#welcome-question')).toBeFocused();
    await expect(page.locator('#welcome-choices input:checked')).toHaveCount(0);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.locator('#welcome-step')).toHaveText('QUESTION 1 OF 3');
    await answer(page, 'Serve a website');
    await expect(page.getByRole('radio', { name: 'RHEL 10', exact: true })).toBeChecked();
    await answer(page, 'RHEL 10');
    await expect(page.getByRole('radio', { name: 'OCI image only', exact: true })).toBeChecked();
    expect(await page.evaluate(() => ({ recipe: JSON.stringify(recipe), storage: JSON.stringify(localStorage) }))).toEqual(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('illustrated answers preselect RHEL 10 while allowing an explicit RHEL 9 choice', async ({ page }) => {
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
  await expect(recommended.getByRole('radio')).toBeChecked();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('#welcome-step')).toHaveText('QUESTION 3 OF 3');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await answer(page, 'RHEL 9');
  await expect(page.locator('.welcome-visual svg')).toHaveCount(4);
  await expect(page.locator('.welcome-badge')).toHaveText(['Default', 'QCOW2', 'VMDK', 'Raw disk']);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'RHEL 9', exact: true })).toBeChecked();
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
  await expect(page.locator('#code')).toContainText('RUN dnf install -y open-vm-tools');
  await expect(page.locator('#code')).toContainText('RUN systemctl enable vmtoolsd');
  await expect(page.locator('#download')).toBeEnabled();
  await page.evaluate(() => navigateView('build'));
  await expect(page.locator('#artifact-format')).toHaveValue('vmdk');
  await expect(page.locator('#artifact-code')).toContainText('vmdk');
});

test('welcome preserves existing files and pins until confirmed, and clears a cross-release pin', async ({ page }) => {
  await page.evaluate(() => {
    document.getElementById('artifact-format').value = 'vmdk';
    recipe.digest = 'sha256:' + 'a'.repeat(64);
    recipe.files = { 'files/keep.txt': 'a2VlcA==' };
  });
  const before = await page.evaluate(() => JSON.stringify(recipe));
  await answer(page, 'Start with a clean base');
  await answer(page, 'RHEL 9');
  await answer(page, 'OCI image only');
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

test('default starter creates an OCI-only RHEL 10 recipe without entering disk setup', async ({ page }) => {
  await answer(page, 'Run containers');
  await expect(page.getByRole('radio', { name: 'RHEL 10', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('radio', { name: 'OCI image only', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('#welcome-summary')).toContainText('RHEL 10');
  await expect(page.locator('#welcome-summary')).toContainText('OCI image only');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Create my recipe' }).click();
  await expect(page).toHaveURL(/\?view=compose/);
  await expect(page.locator('#code')).not.toContainText('open-vm-tools');
  await page.getByRole('button', { name: 'Publish Push to your registry', exact: true }).click();
  await expect(page.locator('#build-publish')).toBeVisible();
  await expect(page.locator('#build-install')).toBeHidden();
  await page.getByRole('button', { name: 'Update an existing host', exact: true }).click();
  await expect(page.locator('#build-maintain')).toBeVisible();
  await page.getByRole('button', { name: 'Publish Push to your registry', exact: true }).click();
  await page.getByRole('button', { name: 'Optional: create a bootable disk', exact: true }).click();
  await expect(page.locator('#build-install')).toBeVisible();
  await page.getByRole('button', { name: 'Use an existing bootc host instead', exact: true }).click();
  await expect(page.locator('#build-maintain')).toBeVisible();
});
