const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test.beforeEach(async ({ page }, testInfo) => {
  await page.addInitScript(mode => localStorage.setItem('imagecraft-color-mode', mode), testInfo.project.name.endsWith('dark') ? 'dark' : 'light');
});

async function mockClipboard(page, denied = false) {
  await page.evaluate(denied => {
    window.copiedCommands = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async text => {
        if (denied) throw new DOMException('Permission denied', 'NotAllowedError');
        window.copiedCommands.push(text);
      },
    } });
  }, denied);
}

test('terminal copies whole current shells with caution comments, without prompts or unrelated host actions', async ({ page }, testInfo) => {
  await page.goto('/?view=compose');
  await page.locator('#registry').fill('quay.io/example/reviewed-os:v2');
  await page.goto('/?view=build');
  await mockClipboard(page);
  const build = page.locator('#build-code');
  const commands = await build.locator('code').allTextContents();
  expect(commands).toEqual([
    'podman login registry.redhat.io',
    'podman build -t quay.io/example/reviewed-os:v2 .',
    'podman login quay.io',
    'podman push quay.io/example/reviewed-os:v2',
  ]);
  const buildShell = '# Run from your reviewed, extracted build folder\n' + commands.join('\n') + '\n\n# Pin an immutable release reference for production\n';
  await page.locator('#build-copy').filter({ hasText: /^Copy$/ }).click();
  expect(await page.evaluate(() => window.copiedCommands)).toEqual([buildShell]);
  await expect(build.getByRole('button')).toHaveCount(0);
  await expect(page.locator('#build-publish [data-copy-shell]')).toHaveCount(1);
  const longCommand = build.locator('code').nth(1);
  await longCommand.focus();
  await expect(longCommand).toBeFocused();
  if (testInfo.project.name.startsWith('mobile')) {
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => longCommand.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  }
  await page.locator('#build-copy').focus();
  await page.keyboard.press('Enter');
  await page.locator('.build-steps [data-build-step="maintain"]').click();
  await expect(page.getByRole('note', { name: 'Warning: review before rebooting' })).toBeVisible();
  await page.locator('[data-copy-shell="update-code"]').filter({ hasText: /^Copy$/ }).click();
  await page.getByText('Roll back if needed', { exact: true }).click();
  await page.locator('[data-copy-shell="rollback-code"]').click();
  const afterReboot = '# After reconnecting, inspect the booted deployment and service health:\nsudo bootc status\n';
  expect(await page.evaluate(() => window.copiedCommands)).toEqual([
    buildShell, buildShell,
    'sudo bootc status\nsudo bootc upgrade\nsudo bootc status\n# Activate only after inspecting the staged deployment, in a maintenance window:\nsudo systemctl reboot\n' + afterReboot,
    'sudo bootc status\nsudo bootc rollback\nsudo bootc status\n# Activate only after inspecting the deployment, in a maintenance window:\nsudo systemctl reboot\n' + afterReboot,
  ]);
  await expect(page.locator('#view-build .terminal-output button')).toHaveCount(0);
  await expect(page.locator('#toast')).toContainText('nothing executed');
  await expect(page.locator('#update-code')).not.toContainText('bootc rollback');
  await expect(page.locator('#rollback-code')).not.toContainText('bootc upgrade');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('build-terminal.png'), fullPage: true });
});

test('clipboard failures give manual fallback and invalid recipes disable build copying only', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?view=build');
  await mockClipboard(page, true);
  await page.locator('#build-copy').click();
  await expect(page.locator('#toast')).toHaveText('Clipboard unavailable. Select the command text and copy it manually.');
  expect(await page.evaluate(() => window.copiedCommands)).toEqual([]);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }));
  await page.locator('#build-copy').click();
  await expect(page.locator('#toast')).toContainText('copy it manually');
  await page.goto('/?view=compose');
  await page.getByRole('textbox', { name: 'Package names for step 1', exact: true }).fill('');
  await page.goto('/?view=build');
  await expect(page.locator('#build-copy')).toBeDisabled();
  await expect(page.locator('#build-error')).toHaveText('Fix recipe errors in Compose before copying build commands.');
  await expect(page.locator('#build-code button')).toHaveCount(0);
  await expect(page.locator('[data-copy-shell="update-code"]')).toBeEnabled();
  await expect(page.locator('[data-copy-shell="rollback-code"]')).toBeEnabled();
  await page.goto('/?view=compose');
  await page.locator('#registry').fill('not a valid image');
  await page.goto('/?view=build');
  await expect(page.locator('#build-copy')).toBeDisabled();
  await expect(page.locator('#build-code button')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('guidance keeps critical notes visible and secondary references collapsed and keyboard accessible', async ({ page }) => {
  await page.goto('/?view=learn');
  await expect(page.getByRole('note', { name: 'Warning: keep secrets outside the image' })).toBeVisible();
  await expect(page.getByRole('note', { name: 'Info: rollback does not restore data' })).toBeVisible();
  const references = page.locator('#view-learn .guide-details');
  await expect(references).toHaveCount(4);
  for (const reference of await references.all()) {
    expect(await reference.evaluate(el => el.open)).toBe(false);
    await reference.locator('summary').focus();
    await page.keyboard.press('Enter');
    expect(await reference.evaluate(el => el.open)).toBe(true);
    await page.keyboard.press('Enter');
    expect(await reference.evaluate(el => el.open)).toBe(false);
  }
  expect(await page.locator('#view-learn').innerText()).toContain('never executes');
  await page.goto('/?view=pipeline');
  await expect(page.getByRole('note', { name: 'Warning: trusted builds only' })).toBeVisible();
  await expect(page.getByRole('note', { name: 'Info: build and publish only' })).toBeVisible();
  for (const reference of await page.locator('#view-pipeline .guide-details').all()) {
    expect(await reference.evaluate(el => el.open)).toBe(false);
    await reference.locator('summary').click();
    expect(await reference.evaluate(el => el.open)).toBe(true);
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('build steps show one task at a time, preserve wizard inputs, and disclose recovery on demand', async ({ page }) => {
  await page.goto('/?view=build');
  const before = await page.evaluate(() => JSON.stringify(localStorage));
  await expect(page.locator('#build-publish')).toBeVisible();
  await expect(page.locator('#artifact-fields')).toBeHidden();
  await expect(page.locator('#update-code')).toBeHidden();
  for (const step of ['publish', 'install', 'maintain']) {
    const button = page.locator('.build-steps [data-build-step="' + step + '"]');
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.build-panel:not([hidden])')).toHaveCount(1);
    await expect(page.locator('.build-panel:not([hidden]) .terminal-output:visible')).toHaveCount(1);
    if (step === 'install') {
      await page.locator('#artifact-format').selectOption('raw');
      await page.locator('#artifact-user').fill('operator');
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await expect(page.locator('#rollback-code')).toBeHidden();
  await page.getByText('Roll back if needed', { exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#rollback-code')).toBeVisible();
  await expect(page.getByRole('note', { name: 'Warning: rollback does not restore data' })).toBeVisible();
  await page.locator('.build-steps [data-build-step="install"]').click();
  await expect(page.locator('#artifact-format')).toHaveValue('raw');
  await expect(page.locator('#artifact-user')).toHaveValue('operator');
  expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(before);
  await page.getByRole('button', { name: 'Next: Maintain', exact: true }).click();
  await expect(page.locator('.build-steps [data-build-step="maintain"]')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('lifecycle loops from an installed-host update to the next recipe without repeating disk installation', async ({ page }) => {
  await page.goto('/?view=compose');
  const cycle = page.getByRole('navigation', { name: 'OS image lifecycle', exact: true });
  await expect(cycle.locator('[aria-current="step"]')).toHaveAttribute('data-lifecycle', 'compose');
  const before = await page.evaluate(() => JSON.stringify(recipe));
  for (const step of ['build', 'publish', 'boot', 'update', 'compose']) {
    await cycle.locator(`[data-lifecycle="${step}"]`).focus();
    await page.keyboard.press('Enter');
    await expect(cycle.locator('[aria-current="step"]')).toHaveAttribute('data-lifecycle', step);
    if (step === 'boot') {
      await expect(page.locator('#build-install')).toBeVisible();
      await page.locator('#artifact-user').fill('operator');
    } else if (step === 'update') {
      await expect(page.locator('#update-code')).toBeVisible();
      await expect(page.locator('#build-install')).toBeHidden();
    } else if (step === 'compose') {
      await expect(page.locator('#view-compose')).toBeVisible();
    } else {
      await expect(page.locator('#build-publish')).toBeVisible();
      await expect(page.locator('#build-code')).toContainText('podman build');
      await expect(page.locator('#build-code')).toContainText('podman push');
    }
  }
  await cycle.locator('[data-lifecycle="boot"]').click();
  await expect(page.locator('#artifact-user')).toHaveValue('operator');
  expect(await page.evaluate(() => JSON.stringify(recipe))).toBe(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
