import { test, expect, type Page } from '@playwright/test';

test.setTimeout(120000);

async function openProjectList(page: Page) {
  const backButton = page.getByRole('button', { name: '返回项目列表' });

  if (await backButton.isVisible({ timeout: 1000 }).catch(() => false)) {
    await backButton.click();
    await expect(page.getByRole('heading', { name: '项目列表' })).toBeVisible();
  }
}

test('验证快照、灵感卡片与伏笔最小闭环', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });

  await openProjectList(page);
  await page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: '最后一个修仙者' }) })
    .first()
    .click();
  await page.getByRole('button', { name: '编辑', exact: true }).click();

  await expect(page.getByRole('button', { name: '记录' })).toBeVisible();
  await page.getByRole('button', { name: '记录' }).click();

  await expect(page.getByRole('button', { name: '手动创建快照' })).toBeVisible();
  await page.getByRole('button', { name: '手动创建快照' }).click();
  await expect(page.locator('article').filter({ hasText: '手动创建快照' }).first()).toBeVisible();

  await page.getByRole('button', { name: '灵感卡片' }).click();
  page.once('dialog', (dialog) => dialog.accept('测试灵感卡片'));
  await page.getByRole('button', { name: '保存当前正文' }).click();
  await expect(page.locator('article').filter({ hasText: '测试灵感卡片' }).first()).toBeVisible();

  await page.keyboard.press('Escape');

  page.once('dialog', (dialog) => dialog.accept('测试伏笔'));
  await page.getByRole('button', { name: '记为伏笔' }).click();

  await page.getByRole('button', { name: '伏笔追踪' }).click();
  await expect(page.getByText('测试伏笔')).toBeVisible();
  await expect(page.getByRole('button', { name: '打开来源章节' })).toBeVisible();
});
