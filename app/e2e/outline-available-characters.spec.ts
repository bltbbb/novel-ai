import { expect, test, type Page } from '@playwright/test';

test.setTimeout(120000);

test.use({
  viewport: {
    width: 1600,
    height: 1200,
  },
});

type PlanRequestPayload = {
  chapterId?: string;
  chapterTitle?: string;
  chapterBeat?: string;
  requiredEntityNames?: string[];
  availableCharacterNames?: string[];
};

async function openProjectList(page: Page) {
  const backButton = page.getByRole('button', { name: '返回项目列表' });

  if (await backButton.isVisible({ timeout: 1000 }).catch(() => false)) {
    await backButton.click();
    await expect(page.getByRole('heading', { name: '项目列表' })).toBeVisible();
  }
}

test('availableCharacters 仍是人工维护名单，并会进入单步 Plan 请求而不是自动回填', async ({ page }) => {
  const planRequests: PlanRequestPayload[] = [];

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

    if (url.pathname === '/api/generation/jobs' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ jobs: [] }),
      });
      return;
    }

    if (url.pathname === '/api/runtime/generation-gate' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          config: {
            reviewRewriteMinSeverity: 'high',
            reviewMaxRewriteCount: 2,
            reviewScoreThresholds: {
              consistency: 70,
              continuity: 70,
              reader_pull: 70,
            },
            polishFailBlockReady: true,
            lightweightRecall: {
              minScore: 3,
              topK: 4,
              phraseWeight: 2,
              entityWeight: 3,
              recencyWeight: 1,
            },
          },
        }),
      });
      return;
    }

    if (url.pathname === '/api/runtime/generation-debug/entities' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [] }),
      });
      return;
    }

    if (url.pathname === '/api/runtime/generation-debug/chapters' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [] }),
      });
      return;
    }

    if (url.pathname === '/api/runtime/generation-debug/relationships' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [] }),
      });
      return;
    }

    if (url.pathname === '/api/ai/plan' && request.method() === 'POST') {
      const payload = JSON.parse(request.postData() || '{}') as PlanRequestPayload;
      planRequests.push(payload);

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          outline: {
            goal: '验证 availableCharacters 已进入单步 Plan 请求',
            obstacle: '当前由 e2e mock 返回计划结果',
            cost: '无额外代价',
            beats: ['人工维护名单进入请求，且不自动混入焦点角色与必须出场'],
            timeAnchor: '夜',
            chapterTimeSpan: '半个时辰',
            gapFromPrevious: '紧接上一场',
            strand: 'quest',
            hookType: '角色调度',
            hookStrength: 'medium',
            immutableFacts: ['availableCharacterNames 来自章节拍手工名单'],
          },
          rawText: 'ok',
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

  await expect(page.getByRole('button', { name: '大纲', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /第 1 卷 第一卷/ }).click();
  await expect(page.getByText('章节拍表')).toBeVisible();

  await page
    .locator('label')
    .filter({ hasText: '场景功能' })
    .locator('textarea')
    .first()
    .fill('验证 availableCharacters 是否只按人工维护名单进入单步 Plan 请求');
  await page
    .locator('label')
    .filter({ hasText: '焦点角色' })
    .locator('textarea')
    .first()
    .fill('林冲');
  await page
    .locator('label')
    .filter({ hasText: '必须出场' })
    .locator('textarea')
    .first()
    .fill('谢无咎');
  await page
    .locator('label')
    .filter({ hasText: '可出场候选' })
    .locator('textarea')
    .first()
    .fill('茶铺老板\n余化及');
  await page.getByRole('button', { name: '保存本拍' }).first().click();

  await page.getByRole('button', { name: '创作工作台', exact: true }).click();
  await page.getByRole('button', { name: '生成', exact: true }).click();

  await expect(page.getByText('焦点角色：林冲')).toBeVisible();
  await page.getByRole('button', { name: /高级选项/ }).click();
  await expect(page.getByRole('button', { name: '单步 Plan' })).toBeVisible();

  await page.getByRole('button', { name: '单步 Plan' }).click();

  await expect.poll(() => planRequests.length).toBe(1);
  await expect(page.getByText('验证 availableCharacters 已进入单步 Plan 请求')).toBeVisible();

  const payload = planRequests[0];
  const availableCharacterNames = payload.availableCharacterNames ?? [];
  const chapterBeat = payload.chapterBeat ?? '';

  expect(payload.chapterId).toBeTruthy();
  expect(payload.chapterTitle).toBeTruthy();
  expect(availableCharacterNames).toEqual(['茶铺老板', '余化及']);
  expect(availableCharacterNames).not.toContain('林冲');
  expect(availableCharacterNames).not.toContain('谢无咎');
  expect(payload.requiredEntityNames ?? []).toEqual(expect.arrayContaining(['林冲', '谢无咎']));
  expect(chapterBeat).toContain('焦点角色：林冲');
  expect(chapterBeat).toContain('必须出场：谢无咎');
  expect(chapterBeat).toContain('可出场候选：茶铺老板；余化及');
});
