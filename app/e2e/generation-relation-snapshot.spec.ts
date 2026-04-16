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
  relationSnapshot?: Array<{
    id?: string;
    sourceEntityId?: string;
    targetEntityId?: string;
    sourceEntityName?: string;
    targetEntityName?: string;
    relationType?: string;
    origin?: string;
    description?: string;
    currentStance?: string;
    currentIntensity?: number;
    stanceReason?: string;
    draft?: boolean;
  }>;
};

async function openProjectList(page: Page) {
  const backButton = page.getByRole('button', { name: '返回项目列表' });

  if (await backButton.isVisible({ timeout: 1000 }).catch(() => false)) {
    await backButton.click();
    await expect(page.getByRole('heading', { name: '项目列表' })).toBeVisible();
  }
}

test('单步 Plan 会把前端显式关系快照带入 /api/ai/plan 请求体', async ({ page }) => {
  const planRequests: PlanRequestPayload[] = [];
  let runtimeRelationshipRequestCount = 0;

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
      runtimeRelationshipRequestCount += 1;
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
            goal: '测试关系快照已进入 plan 请求',
            obstacle: '当前后端由 e2e mock 接管',
            cost: '无额外代价',
            beats: ['围绕林冲与谢无咎的关系推进试探'],
            timeAnchor: '夜',
            chapterTimeSpan: '一刻钟',
            gapFromPrevious: '紧接上一场',
            strand: 'quest',
            hookType: '关系推进',
            hookStrength: 'medium',
            immutableFacts: ['relationSnapshot 已进入请求体'],
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

  await page.getByLabel('场景功能').first().fill('验证 relationSnapshot 是否会进入 /api/ai/plan 请求体');
  await page.getByLabel('焦点角色').first().fill('林冲');
  await page.getByRole('button', { name: '保存本拍' }).first().click();

  await page.getByRole('button', { name: '设定库' }).click();
  await expect(page.getByRole('button', { name: '新建设定' })).toBeVisible();
  await page.getByRole('button', { name: '人物', exact: true }).click();
  await page.getByRole('button', { name: /^林冲/ }).first().click();

  await page.getByLabel('对手方').selectOption({ label: '谢无咎' });
  await page.getByLabel('关系类型').fill('试探同盟');
  await page.getByLabel('关系本质').fill('双方暂时合作，但都在留后手。');
  await page.getByLabel('建立原因').fill('归炉井线索迫使两人暂时站到同一边。');
  await page.getByLabel('当前态度').fill('表面合作');
  await page.getByLabel('强度 0-5').fill('4');
  await page.getByLabel('态度锚点').fill('黑铁片与归炉井线索让双方暂时绑定。');
  await page.getByRole('button', { name: '创建关系' }).click();

  await expect(page.getByText('已配置 1 条与当前人物相关的规划关系。')).toBeVisible();
  await expect.poll(() => runtimeRelationshipRequestCount).toBeGreaterThan(0);

  await page.getByRole('button', { name: '创作工作台', exact: true }).click();
  await page.getByRole('button', { name: '生成', exact: true }).click();

  await expect(page.getByText('焦点角色：林冲')).toBeVisible();
  await page.getByRole('button', { name: /高级选项/ }).click();
  await expect(page.getByRole('button', { name: '单步 Plan' })).toBeVisible();

  await page.getByRole('button', { name: '单步 Plan' }).click();

  await expect.poll(() => planRequests.length).toBe(1);
  await expect(page.getByText('测试关系快照已进入 plan 请求')).toBeVisible();

  const payload = planRequests[0];
  const relationSnapshot = payload.relationSnapshot ?? [];

  expect(payload.chapterId).toBeTruthy();
  expect(payload.chapterTitle).toBeTruthy();
  expect(relationSnapshot).toHaveLength(1);
  expect(relationSnapshot[0]).toMatchObject({
    sourceEntityId: 'demo-entity-linchong',
    targetEntityId: 'demo-entity-xie-wujiu',
    sourceEntityName: '林冲',
    targetEntityName: '谢无咎',
    relationType: '试探同盟',
    origin: '归炉井线索迫使两人暂时站到同一边。',
    description: '双方暂时合作，但都在留后手。',
    currentStance: '表面合作',
    currentIntensity: 4,
    stanceReason: '黑铁片与归炉井线索让双方暂时绑定。',
    draft: true,
  });
});
