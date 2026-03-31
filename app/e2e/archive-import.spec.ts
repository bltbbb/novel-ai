import { test, expect } from '@playwright/test';

test.setTimeout(120000);

test('验证项目归档导入导出', async ({ page }) => {
  const projectTitle = `归档验证项目${Date.now()}`;

  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });

  const backButton = page.getByRole('button', { name: '返回项目列表' });

  if (await backButton.isVisible()) {
    await backButton.click();
  }

  await page.getByRole('button', { name: '创建项目' }).click();
  await page.getByRole('button', { name: /仙侠/ }).click();
  await page.getByLabel('项目标题').fill(projectTitle);
  await page.getByRole('button', { name: '创建项目' }).last().click();

  await page.getByRole('button', { name: '返回项目列表' }).click();

  const projectCard = page.locator('article').filter({ hasText: projectTitle }).first();
  await expect(projectCard).toBeVisible();

  const archiveDownload = page.waitForEvent('download');
  await projectCard.getByTitle('导出项目归档').click();
  const archiveFile = await archiveDownload;
  const archivePath = await archiveFile.path();

  if (!archivePath) {
    throw new Error('未获取到项目归档文件路径');
  }

  await page.getByRole('button', { name: '导入项目' }).click();
  await page.locator('input[type="file"]').setInputFiles(archivePath);

  await expect(page.getByRole('heading', { name: projectTitle }).first()).toBeVisible();
  await page.getByRole('button', { name: '返回项目列表' }).click();
  await expect.poll(async () => page.locator('article').filter({ hasText: projectTitle }).count()).toBe(2);
});
