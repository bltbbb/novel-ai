import { test, expect } from '@playwright/test';

test.setTimeout(120000);

test('验证模板创建与关系图谱可见', async ({ page }) => {
  const projectTitle = `图谱验证项目${Date.now()}`;

  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });

  const backButton = page.getByRole('button', { name: '返回项目列表' });

  if (await backButton.isVisible()) {
    await backButton.click();
  }

  await page.getByRole('button', { name: '创建项目' }).click();
  await page.getByRole('button', { name: /赛博朋克/ }).click();
  await page.getByLabel('项目标题').fill(projectTitle);
  await page.getByRole('button', { name: '创建项目' }).last().click();

  await expect(page.getByRole('heading', { name: projectTitle }).first()).toBeVisible();
  await page.getByRole('button', { name: '关系图谱' }).click();

  await expect(page.getByText('当前共')).toContainText('节点');
  await expect(page.getByRole('button', { name: /沈渡/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /第1章：凌晨四点的上行链路/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /幽栈终端/ }).first()).toBeVisible();
});
