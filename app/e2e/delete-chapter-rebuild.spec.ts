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

  if (await backButton.isVisible({ timeout: 1000 }).catch(() => false)) {
    await backButton.click();
    await expect(page.getByRole('heading', { name: '项目列表' })).toBeVisible();
  }
}

test('删除章节后会重排本地章序并触发服务端生成态重建', async ({ page }) => {
  const rebuildRequests: Array<Record<string, unknown>> = [];

  await page.route('http://localhost:3001/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === '/api/health') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
      return;
    }

    if (url.pathname === '/api/search') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: [] }),
      });
      return;
    }

    if (url.pathname === '/api/runtime/generation-maintenance/rebuild-project-artifacts' && request.method() === 'POST') {
      const payload = JSON.parse(request.postData() || '{}') as Record<string, unknown>;
      rebuildRequests.push(payload);

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          rebuiltChapterCount: Array.isArray(payload.chapters) ? payload.chapters.length : 0,
          rebuiltVolumeCount: 2,
        }),
      });
      return;
    }

    await route.abort();
  });

  await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
  await openProjectList(page);

  await page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: '最后一个修仙者' }) })
    .first()
    .click();

  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByRole('button', { name: /^第13章：旧坊市线索/ }).click();
  await expect(page.locator('input[placeholder="章节标题"]')).toHaveValue('第13章：旧坊市线索');

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('button[title="删除当前章节"]').click();

  await expect.poll(() => rebuildRequests.length).toBe(1);
  await expect(page.getByRole('button', { name: /^第13章：旧坊市线索/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /第21章：归炉井残图.*第 6 章/ })).toBeVisible();

  const payload = rebuildRequests[0] as {
    projectId?: string;
    chapters?: Array<{
      chapterId: string;
      chapterOrder: number;
      previousChapterId?: string;
      stateChanges?: Array<{
        entityName: string;
        field: string;
        newValue: string;
      }>;
    }>;
    foreshadowSnapshot?: Array<{
      title: string;
      status: string;
      sourceChapterId?: string | null;
      resolvedChapterId?: string | null;
    }>;
  };

  expect(payload.projectId).toBeTruthy();
  expect(payload.chapters?.map((chapter) => chapter.chapterId)).not.toContain('demo-chapter-013');
  expect(payload.chapters?.map((chapter) => chapter.chapterOrder)).toEqual([1, 2, 3, 4, 5, 6, 7]);

  const chapter21 = payload.chapters?.find((chapter) => chapter.chapterId === 'demo-chapter-021');
  expect(chapter21?.chapterOrder).toBe(6);
  expect(chapter21?.previousChapterId).toBe('demo-chapter-015');

  const latestBlackIronState = (payload.chapters ?? [])
    .flatMap((chapter) => (chapter.stateChanges ?? []).map((change) => ({
      chapterOrder: chapter.chapterOrder,
      ...change,
    })))
    .filter((change) => change.entityName === '黑铁片' && change.field === '状态')
    .sort((left, right) => left.chapterOrder - right.chapterOrder)
    .at(-1);

  expect(latestBlackIronState?.newValue).toBe('微热');

  const mapForeshadow = payload.foreshadowSnapshot?.find((item) => item.title === '归炉井入口坐标');
  expect(mapForeshadow?.sourceChapterId ?? null).toBeNull();
  expect(mapForeshadow?.status).toBe('activated');
  expect(mapForeshadow?.resolvedChapterId).toBe('demo-chapter-024');
});
