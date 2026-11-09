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

test('terminal copies exact current commands without prompts or unrelated host actions', async ({ page }, testInfo) => {
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
  await page.locator('#build-copy').click();
  expect(await page.evaluate(() => window.copiedCommands)).toEqual([commands.join('\n')]);
  const longCommand = build.locator('code').nth(1);
  await longCommand.focus();
  await expect(longCommand).toBeFocused();
  if (testInfo.project.name.startsWith('mobile')) {
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => longCommand.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  }
  const buttons = build.getByRole('button');
  for (let i = 0; i < commands.length; i++) {
    await buttons.nth(i).focus();
    await page.keyboard.press('Enter');
  }
  await page.locator('#update-code').getByRole('button', { name: 'Copy command: sudo bootc upgrade', exact: true }).click();
  await page.locator('#rollback-code').getByRole('button', { name: 'Copy command: sudo bootc rollback', exact: true }).click();
  expect(await page.evaluate(() => window.copiedCommands)).toEqual([
    commands.join('\n'), ...commands, 'sudo bootc upgrade', 'sudo bootc rollback',
  ]);
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
  await page.locator('#build-code').getByRole('button').first().click();
  await expect(page.locator('#toast')).toContainText('copy it manually');
  await page.goto('/?view=compose');
  await page.getByRole('textbox', { name: 'packages value for step 1', exact: true }).fill('');
  await page.goto('/?view=build');
  await expect(page.locator('#build-copy')).toBeDisabled();
  await expect(page.locator('#build-error')).toHaveText('Fix recipe errors in Compose before copying build commands.');
  for (const button of await page.locator('#build-code button').all()) await expect(button).toBeDisabled();
  await expect(page.locator('#update-code button').first()).toBeEnabled();
  await expect(page.locator('#rollback-code button').first()).toBeEnabled();
  await page.goto('/?view=compose');
  await page.locator('#registry').fill('not a valid image');
  await page.goto('/?view=build');
  await expect(page.locator('#build-copy')).toBeDisabled();
  await expect(page.locator('#build-code button')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('guidance keeps critical notes visible and secondary references collapsed and keyboard accessible', async ({ page }) => {
  await page.goto('/');
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
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
