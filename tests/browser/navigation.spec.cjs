const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const views = ['drafts', 'learn', 'compose', 'build', 'pipeline', 'templates'];

async function visibleView(page, view) {
  await expect(page.locator(`#view-${view}`)).toBeVisible();
  await expect(page.locator('.view:not(.hidden)')).toHaveCount(1);
  await expect(page.locator('.projectbar')).toBeVisible({ visible: view === 'compose' });
}

async function navigate(page, view) {
  if (await page.locator('#view-home').isVisible()) {
    await page.getByRole('link', { name: 'Go straight to Compose' }).click();
  }
  const controls = page.locator(`.sidebar [data-view="${view}"],.path [data-view="${view}"]`);
  for (const control of await controls.all()) {
    if (await control.isVisible()) { await control.click(); return; }
  }
  throw new Error(`No visible navigation to ${view}`);
}

async function savedState(page) {
  return page.evaluate(() => JSON.stringify({ ...localStorage }));
}

test.beforeEach(async ({ page }, testInfo) => {
  await page.addInitScript(mode => localStorage.setItem('imagecraft-color-mode', mode), testInfo.project.name.endsWith('dark') ? 'dark' : 'light');
});

test('intent-first homepage is accessible with direct editor and guide links', async ({ page }, testInfo) => {
  await page.goto('/');
  await visibleView(page, 'home');
  await expect(page.locator('#chapter')).toHaveText('START WITH INTENT');
  await expect(page.locator('#headline')).toHaveText('An OS image. With a purpose.');
  await expect(page.getByRole('link', { name: 'Go straight to Compose' })).toHaveAttribute('href', '?view=compose');
  await expect(page.getByRole('link', { name: 'Read the field guide' })).toHaveAttribute('href', '?view=learn');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to current section' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#headline')).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('understand-homepage.png'), fullPage: true });
  await page.getByRole('link', { name: 'Go straight to Compose' }).click();
  await visibleView(page, 'compose');
  await expect(page).toHaveURL(/\?view=compose/);
  await expect(page.locator('#headline')).toBeFocused();
});

test('every direct-link reload supports logo mouse and real keyboard home navigation', async ({ page }) => {
  for (const view of views) {
    await page.goto('/?view=' + view);
    await page.reload();
    await visibleView(page, view);
    await page.locator('.brand .mark').click();
    await visibleView(page, 'home');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('#headline')).toBeFocused();
    await page.goto('/?view=' + view);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Imagecraft home', exact: true })).toBeFocused();
    expect(await page.locator('.brand').evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
    await page.keyboard.press('Enter');
    await visibleView(page, 'home');
    await expect(page).toHaveURL(/\/$/);
  }
  await page.goto('/index.html?view=build');
  await page.locator('.brand').click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/?view=unknown');
  await visibleView(page, 'home');
});

test('history and home preserve edited recipe and preferences across reloads', async ({ page }) => {
  await page.goto('/?view=compose');
  await page.getByRole('textbox', { name: 'packages value for step 1', exact: true }).fill('httpd curl jq');
  await page.locator('[data-version="9"]').click();
  await page.locator('[data-tab="build"]').click();
  await navigate(page, 'pipeline');
  await page.locator('[data-provider="gitlab"]').click();
  const before = await savedState(page);
  await page.locator('.brand').click();
  await visibleView(page, 'home');
  await page.goBack();
  await visibleView(page, 'pipeline');
  await page.goBack();
  await visibleView(page, 'compose');
  await expect(page.locator('[data-tab="build"]')).toHaveAttribute('aria-pressed', 'true');
  await page.goForward();
  await visibleView(page, 'pipeline');
  expect(await savedState(page)).toBe(before);
  await page.reload();
  await visibleView(page, 'pipeline');
  await expect(page.locator('[data-provider="gitlab"]')).toHaveAttribute('aria-pressed', 'true');
  await navigate(page, 'compose');
  await expect(page.getByRole('textbox', { name: 'packages value for step 1', exact: true })).toHaveValue('httpd curl jq');
  await expect(page.locator('[data-version="9"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await savedState(page)).toBe(before);
});

test('home and every view preserve local file bytes, stage settings and base pins in memory', async ({ page }) => {
  await page.goto('/?view=compose');
  page.on('dialog', dialog => dialog.accept());
  await navigate(page, 'templates');
  await page.getByRole('button', { name: 'Use template: Local service unit', exact: true }).click();
  await page.locator('#view-compose summary').click();
  await page.locator('#base-digest').fill('sha256:' + 'a'.repeat(64));
  await page.locator('#apply-digest').click();
  await page.locator('#stage-name').fill('builder');
  await page.locator('#stage-base').fill('quay.io/example/builder:v1');
  await page.locator('#add-stage').click();
  const before = await page.evaluate(() => JSON.stringify(recipe));
  for (const view of views) {
    await navigate(page, view);
    await page.locator('.brand').click();
    await visibleView(page, 'home');
    expect(await page.evaluate(() => JSON.stringify(recipe))).toBe(before);
  }
  await navigate(page, 'compose');
  await expect(page.locator('#download')).toBeEnabled();
  await page.reload();
  await expect(page.locator('#warning')).toContainText('Select the referenced local file again');
  await expect(page.locator('#download')).toBeDisabled();
  expect(await page.evaluate(() => Object.keys(recipe.files))).toEqual([]);
  expect(await page.evaluate(() => recipe.digest)).toBe('sha256:' + 'a'.repeat(64));
  expect(await page.evaluate(() => recipe.stages[0].name)).toBe('builder');
});
