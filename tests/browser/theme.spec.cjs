const { test, expect } = require('@playwright/test');

test('system theme is the default, follows live OS changes and preserves explicit overrides', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-color-mode', 'dark');
  const toggle = page.getByRole('button', { name: 'Dark mode', exact: true });
  await expect(toggle).toHaveCount(1);
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle).toHaveAttribute('title', 'Switch to light mode');
  expect(await page.evaluate(() => localStorage.getItem('imagecraft-color-mode'))).toBeNull();
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('body')).toHaveAttribute('data-color-mode', 'light');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  expect(await page.evaluate(() => localStorage.getItem('imagecraft-color-mode'))).toBe('dark');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('body')).toHaveAttribute('data-color-mode', 'dark');
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('body')).toHaveAttribute('data-color-mode', 'dark');
  await toggle.click();
  await expect(page.locator('body')).toHaveAttribute('data-color-mode', 'light');
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => localStorage.getItem('imagecraft-color-mode'))).toBe('light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('body')).toHaveAttribute('data-color-mode', 'light');
});

test('previously saved system and explicit themes still initialize the single toggle', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  for (const preference of ['light', 'dark', 'system']) {
    await page.goto('/');
    await page.evaluate(mode => localStorage.setItem('imagecraft-color-mode', mode), preference);
    await page.reload();
    const dark = preference !== 'light';
    await expect(page.locator('body')).toHaveAttribute('data-color-mode', dark ? 'dark' : 'light');
    await expect(page.getByRole('button', { name: 'Dark mode', exact: true })).toHaveAttribute('aria-pressed', String(dark));
  }
});
