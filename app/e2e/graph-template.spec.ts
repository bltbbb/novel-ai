import { expect, test, type Page } from '@playwright/test';

test.setTimeout(120000);

async function openProjectList(page: Page) {
  const backButton = page.getByRole('button', { name: '返回项目列表' });

  await backButton.click({ timeout: 10000 }).catch(() => undefined);

  await expect(page.getByRole('button', { name: '创建新作品' })).toBeVisible();
}

async function createTemplateProject(page: Page, projectTitle: string) {
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
  await openProjectList(page);

  await page.getByRole('button', { name: '创建新作品' }).click({ force: true });
  await expect(page.getByRole('heading', { name: '创建项目' })).toBeVisible();
  await page.getByRole('button', { name: /赛博朋克/ }).click({ force: true });
  await page.getByLabel('项目标题').fill(projectTitle);
  await page.getByRole('button', { name: '创建项目' }).last().click({ force: true });

  await expect(page.getByRole('heading', { name: projectTitle }).first()).toBeVisible();
}

test('关系图谱展示页维持展示 / 观察口径，并可切到关系视图查看显式与运行态关系', async ({
  page,
}) => {
  const projectTitle = `图谱展示烟测${Date.now()}`;

  await createTemplateProject(page, projectTitle);

  await page.getByRole('button', { name: '关系图谱展示 关系观察与诊断视图' }).click();

  await expect(page.getByText('这里是展示 / 观察 / 诊断视图，不是正式关系维护台账。显式关系优先，运行态关系只作观察补充。')).toBeVisible();
  await expect(page.getByRole('button', { name: '综合图谱' })).toBeVisible();
  await expect(page.getByRole('button', { name: '关系视图' })).toBeVisible();

  await page.getByRole('button', { name: '关系视图' }).click();

  await expect(page.getByText('显式关系真源', { exact: true })).toBeVisible();
  await expect(page.getByText('运行态关系观察', { exact: true })).toBeVisible();
  await expect(
    page.getByText('关系视图会把人物作为主节点，并把显式关系真源与运行态观察关系拆开显示，方便直接检查人物关系层。'),
  ).toBeVisible();

  const graphCanvas = page.locator('div.relative').filter({ has: page.locator('svg') }).first();
  await expect
    .poll(async () => graphCanvas.locator('button').count(), { timeout: 10000 })
    .toBeGreaterThan(0);

  await graphCanvas.locator('button').first().click();
  await expect(page.getByText('当前节点', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '前往设定库' })).toBeVisible();
});
