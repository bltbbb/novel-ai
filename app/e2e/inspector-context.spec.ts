import { test, expect } from '@playwright/test';

test.setTimeout(120000);

test.use({
  viewport: {
    width: 1600,
    height: 1200,
  },
});

test('验证 Inspector 中的历史检索与一致性提示', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });

  const backButton = page.getByRole('button', { name: '返回项目列表' });

  if (await backButton.isVisible()) {
    await backButton.click();
  }

  await page.getByText('最后一个修仙者').first().click();

  await expect(page.getByText('历史检索')).toBeVisible();
  await expect(page.getByText('一致性提示')).toBeVisible();
  await expect(page.getByText('检索状态：')).toBeVisible();
  await expect(page.getByText('命中条数：')).toBeVisible();
});
