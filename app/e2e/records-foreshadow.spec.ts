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

test('结构记忆里的伏笔事实 / 规划双模式替代旧伏笔追踪入口', async ({ page }) => {
  const projectTitle = `结构记忆伏笔烟测${Date.now()}`;

  await createBlankProject(page, projectTitle);

  await expect(page.getByRole('button', { name: '伏笔追踪' })).toHaveCount(0);

  await page.getByRole('button', { name: '结构记忆 线程账本与全局约束' }).click();
  await expect(page.getByRole('heading', { name: '结构记忆统一工作台' })).toBeVisible();

  await page.getByRole('button', { name: /^伏笔事实 \/ 规划/ }).click();

  const foreshadowSection = page.locator('section#foreshadow-plan');
  await expect(foreshadowSection).toBeVisible();
  await expect(foreshadowSection.getByRole('heading', { name: '伏笔事实 / 规划' }).last()).toBeVisible();
  await expect(foreshadowSection.getByRole('button', { name: '伏笔事实' })).toBeVisible();
  await expect(foreshadowSection.getByRole('button', { name: '伏笔规划' })).toBeVisible();

  await expect(
    foreshadowSection.getByText('还没有伏笔规划。先挑核心伏笔，补上激活窗口、回收窗口和回收效果。'),
  ).toBeVisible();

  await foreshadowSection.getByRole('button', { name: '伏笔事实' }).click();
  await expect(foreshadowSection.getByText('当前共 0 条伏笔')).toBeVisible();
  await expect(foreshadowSection.getByText('还没有伏笔，先从当前章节创建第一条。')).toBeVisible();
  await expect(
    foreshadowSection.getByText('事实层负责“已经埋下了什么、现在是什么状态”；规划层负责“什么时候动、怎么收”。'),
  ).toBeVisible();
});
