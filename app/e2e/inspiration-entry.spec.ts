import { expect, test, type Page } from '@playwright/test';

test.setTimeout(120000);

test.use({
  viewport: {
    width: 1600,
    height: 1200,
  },
});

async function openProjectList(page: Page) {
  const backButton = page.getByRole('button', { name: '返回项目列表' });

  await backButton.click({ timeout: 10000 }).catch(() => undefined);

  await expect(page.getByRole('button', { name: '创建新作品' })).toBeVisible();
}

async function createBlankProject(page: Page, projectTitle: string) {
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
  await openProjectList(page);

  await page.getByRole('button', { name: '创建新作品' }).click({ force: true });
  await expect(page.getByRole('heading', { name: '创建项目' })).toBeVisible();
  await page.getByText('不使用创作模板').click({ force: true });
  await page.getByLabel('项目标题').fill(projectTitle);
  await page.getByRole('button', { name: '创建项目' }).last().click({ force: true });

  await expect(page.getByRole('heading', { name: projectTitle }).first()).toBeVisible();
}

async function createLoreEntity(page: Page, name: string) {
  page.once('dialog', (dialog) => dialog.accept(name));
  await page.getByRole('button', { name: '新建设定' }).click();
  await expect(page.getByRole('button', { name: new RegExp(name) }).first()).toBeVisible();
}

test('设定库按正式设定 / 候选设定分区，并保持稳定事实层完整度口径', async ({ page }) => {
  const projectTitle = `设定库分区烟测${Date.now()}`;

  await createBlankProject(page, projectTitle);

  await page.getByRole('button', { name: '设定库 角色、地点与世界观' }).click();

  await createLoreEntity(page, '沈炼');
  await expect(page.getByText('正式设定')).toBeVisible();
  await expect(page.getByText('0/8 稳定事实层').first()).toBeVisible();
  await expect(
    page.getByRole('button', { name: /沈炼.*正式.*0\/8 稳定事实层/ }).first(),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '转为草案' })).toBeVisible();

  await createLoreEntity(page, '周宁');
  await page.getByRole('button', { name: '转为草案' }).click();

  await expect(page.getByText('候选设定 / 待确认')).toBeVisible();
  await expect(page.getByRole('button', { name: /周宁.*待确认/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: '确认设定' })).toBeVisible();

  await page.getByRole('button', { name: '确认设定' }).click();

  await expect(page.getByText('候选设定 / 待确认')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '转为草案' })).toBeVisible();
  await expect(page.getByRole('button', { name: /周宁.*正式/ }).first()).toBeVisible();
});
