const { test, expect } = require('@playwright/test');

test('system theme is the default, follows live OS changes and preserves explicit overrides', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-color-mode', 'dark');
  await expect(page.locator('[data-mode="system"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('imagecraft-color-mode'))).toBeNull();
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('body')).toHaveAttribute('data-color-mode', 'light');
  await page.locator('[data-mode="dark"]').click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('body')).toHaveAttribute('data-color-mode', 'dark');
  await page.reload();
  await expect(page.locator('[data-mode="dark"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('body')).toHaveAttribute('data-color-mode', 'dark');
  await page.locator('[data-mode="system"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-color-mode', 'light');
  await page.reload();
  await expect(page.locator('[data-mode="system"]')).toHaveAttribute('aria-pressed', 'true');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('body')).toHaveAttribute('data-color-mode', 'dark');
  await page.locator('[data-mode="light"]').click();
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-color-mode', 'light');
});
