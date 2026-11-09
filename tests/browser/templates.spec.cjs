const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

async function openTemplates(page) {
  const controls = page.locator('.sidebar [data-view="templates"],.path [data-view="templates"]');
  for (const control of await controls.all()) {
    if (await control.isVisible()) { await control.click(); return; }
  }
  throw new Error('No visible template navigation');
}

async function state(page) {
  return page.evaluate(() => JSON.stringify({ recipe, storage: { ...localStorage } }));
}

test('versioned engine avoids stale API failures and all templates respect replacement confirmation', async ({ page }, testInfo) => {
  const errors = [];
  let staleRequests = 0;
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(mode => localStorage.setItem('imagecraft-color-mode', mode), testInfo.project.name.endsWith('dark') ? 'dark' : 'light');
  // Model the pre-ADD API still available at the old, unversioned cache key.
  const staleEngine = fs.readFileSync(path.join(__dirname, '../../public/recipe-engine.js'), 'utf8') + '\ndelete window.RecipeEngine.localSource;';
  await page.route('**/recipe-engine.js', route => {
    staleRequests++;
    return route.fulfill({ contentType: 'application/javascript', body: staleEngine });
  });
  await page.goto('/?view=templates');
  await expect(page.locator('#view-templates')).toBeVisible();
  await expect(page.locator('script[src^="./recipe-engine.js"]')).toHaveAttribute('src', /\?v=[a-f0-9]{12}$/);
  await expect(page.locator('[data-template]')).toHaveCount(6);
  const definitions = await page.evaluate(() => templates.map(t => ({ id: t.id, name: t.name, recipe: t.recipe, count: t.rows.length, files: t.files || {} })));
  expect(definitions).toHaveLength(6);

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Use template: Local service unit', exact: true }).click();
  await expect(page.locator('#view-compose')).toBeVisible();
  const service = definitions.find(t => t.id === 'service-file');
  expect(await page.evaluate(() => recipe.files)).toEqual(service.files);
  expect(Object.keys(service.files)).toHaveLength(1);

  for (const template of definitions) {
    await openTemplates(page);
    const before = await state(page);
    let confirmation = '';
    page.once('dialog', async dialog => { confirmation = dialog.message(); await dialog.dismiss(); });
    await page.getByRole('button', { name: 'Use template: ' + template.name, exact: true }).click();
    expect(confirmation).toBe('Load ' + template.name + '? This replaces your current recipe rows.');
    expect(await state(page)).toBe(before);
    await expect(page.locator('#view-templates')).toBeVisible();

    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Use template: ' + template.name, exact: true }).click();
    await expect(page.locator('#view-compose')).toBeVisible();
    await expect(page.locator('#rows > .row')).toHaveCount(template.count);
    await expect(page.locator('#recipe-title')).toHaveText(template.recipe);
    expect(await page.evaluate(() => recipe.files)).toEqual(template.files);
    expect(await page.evaluate(() => RecipeEngine.errors(recipe))).toEqual([]);
    await expect(page.locator('#code')).toContainText('RUN bootc container lint');
    await expect(page.locator('#download')).toBeEnabled();
  }
  expect(staleRequests).toBe(0);
  expect(errors).toEqual([]);
});
