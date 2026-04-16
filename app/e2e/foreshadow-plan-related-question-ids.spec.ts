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

test('ForeshadowPlan 保存链路当前仍把 relatedQuestionIds 作为预留空数组，不驱动 QuestionPool 自动联动', async ({ page }) => {
  const createRequests: Array<Record<string, unknown>> = [];
  const updateRequests: Array<{ foreshadowPlanId: string; payload: Record<string, unknown> }> = [];
  const questionPoolMutationRequests: Array<{
    method: string;
    pathname: string;
    payload: Record<string, unknown> | null;
  }> = [];
  let questionPoolGetCount = 0;
  let activeProjectId = 'demo-project';
  let foreshadowPlans: Array<Record<string, unknown>> = [];

  await page.route('http://localhost:3001/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const requestProjectId = url.searchParams.get('projectId');

    if (requestProjectId) {
      activeProjectId = requestProjectId;
    }

    if (pathname === '/api/health') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
      return;
    }

    if (pathname === '/api/structure-memory/thread-ledgers' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [],
          alerts: [],
        }),
      });
      return;
    }

    if (pathname === '/api/structure-memory/foreshadow-plans' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: foreshadowPlans,
          alerts: [],
        }),
      });
      return;
    }

    if (pathname === '/api/structure-memory/foreshadow-plans' && request.method() === 'POST') {
      const payload = JSON.parse(request.postData() || '{}') as Record<string, unknown>;
      createRequests.push(payload);

      if (typeof payload.projectId === 'string' && payload.projectId.trim()) {
        activeProjectId = payload.projectId;
      }

      const item = {
        id: 'foreshadow-plan-created-1',
        projectId: activeProjectId,
        foreshadowId: String(payload.foreshadowId ?? ''),
        foreshadowTitle: String(payload.foreshadowTitle ?? ''),
        type: String(payload.type ?? ''),
        importance: payload.importance === 'minor' ? 'minor' : 'major',
        plannedActivateVolume:
          typeof payload.plannedActivateVolume === 'number' ? payload.plannedActivateVolume : null,
        plannedResolveVolume:
          typeof payload.plannedResolveVolume === 'number' ? payload.plannedResolveVolume : null,
        activationCondition: String(payload.activationCondition ?? ''),
        resolveCondition: String(payload.resolveCondition ?? ''),
        dependsOnForeshadowIds: Array.isArray(payload.dependsOnForeshadowIds) ? payload.dependsOnForeshadowIds : [],
        dependsOnForeshadowTitles: Array.isArray(payload.dependsOnForeshadowTitles) ? payload.dependsOnForeshadowTitles : [],
        dependsOnEventKeys: Array.isArray(payload.dependsOnEventKeys) ? payload.dependsOnEventKeys : [],
        relatedQuestionIds: Array.isArray(payload.relatedQuestionIds) ? payload.relatedQuestionIds : [],
        payoffEffect: String(payload.payoffEffect ?? ''),
        createdAt: '2026-04-16T10:00:00.000Z',
        updatedAt: '2026-04-16T10:00:00.000Z',
      };

      foreshadowPlans = [item];

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ item }),
      });
      return;
    }

    if (pathname.startsWith('/api/structure-memory/foreshadow-plans/') && request.method() === 'PUT') {
      const payload = JSON.parse(request.postData() || '{}') as Record<string, unknown>;
      const foreshadowPlanId = decodeURIComponent(pathname.split('/').at(-1) || '');
      updateRequests.push({
        foreshadowPlanId,
        payload,
      });

      const existing = foreshadowPlans.find((item) => item.id === foreshadowPlanId) ?? foreshadowPlans[0];
      const item = {
        ...(existing ?? {}),
        id: foreshadowPlanId,
        projectId: activeProjectId,
        foreshadowId: String(payload.foreshadowId ?? existing?.foreshadowId ?? ''),
        foreshadowTitle: String(payload.foreshadowTitle ?? existing?.foreshadowTitle ?? ''),
        type: String(payload.type ?? existing?.type ?? ''),
        importance: payload.importance === 'minor' ? 'minor' : (existing?.importance ?? 'major'),
        plannedActivateVolume:
          typeof payload.plannedActivateVolume === 'number'
            ? payload.plannedActivateVolume
            : (existing?.plannedActivateVolume ?? null),
        plannedResolveVolume:
          typeof payload.plannedResolveVolume === 'number'
            ? payload.plannedResolveVolume
            : (existing?.plannedResolveVolume ?? null),
        activationCondition: String(payload.activationCondition ?? existing?.activationCondition ?? ''),
        resolveCondition: String(payload.resolveCondition ?? existing?.resolveCondition ?? ''),
        dependsOnForeshadowIds: Array.isArray(payload.dependsOnForeshadowIds)
          ? payload.dependsOnForeshadowIds
          : (existing?.dependsOnForeshadowIds ?? []),
        dependsOnForeshadowTitles: Array.isArray(payload.dependsOnForeshadowTitles)
          ? payload.dependsOnForeshadowTitles
          : (existing?.dependsOnForeshadowTitles ?? []),
        dependsOnEventKeys: Array.isArray(payload.dependsOnEventKeys)
          ? payload.dependsOnEventKeys
          : (existing?.dependsOnEventKeys ?? []),
        relatedQuestionIds: Array.isArray(payload.relatedQuestionIds)
          ? payload.relatedQuestionIds
          : (existing?.relatedQuestionIds ?? []),
        payoffEffect: String(payload.payoffEffect ?? existing?.payoffEffect ?? ''),
        createdAt: String(existing?.createdAt ?? '2026-04-16T10:00:00.000Z'),
        updatedAt: '2026-04-16T10:05:00.000Z',
      };

      foreshadowPlans = [item];

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ item }),
      });
      return;
    }

    if (pathname === '/api/structure-memory/world-state-entries' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [],
        }),
      });
      return;
    }

    if (pathname === '/api/structure-memory/question-pools' && request.method() === 'GET') {
      questionPoolGetCount += 1;

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'question-pool-1',
              projectId: activeProjectId,
              question: '黑铁片真正的来历是什么？',
              firstRaisedChapterId: 'demo-chapter-001',
              firstRaisedAt: '第1章：废墟苏醒',
              belongsToThreadId: null,
              belongsToThreadName: '',
              currentClue: '黑铁片会对古井残纹产生共鸣。',
              falseAnswers: [],
              expectedRevealWindow: '第2卷',
              finalAnswerSummary: '',
              status: 'open',
              createdAt: '2026-04-16T09:40:00.000Z',
              updatedAt: '2026-04-16T09:40:00.000Z',
            },
          ],
          alerts: [],
        }),
      });
      return;
    }

    if (pathname.startsWith('/api/structure-memory/question-pools/') || pathname === '/api/structure-memory/question-pools') {
      if (request.method() !== 'GET') {
        questionPoolMutationRequests.push({
          method: request.method(),
          pathname,
          payload: request.postData() ? (JSON.parse(request.postData() || '{}') as Record<string, unknown>) : null,
        });

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
        return;
      }
    }

    if (pathname === '/api/structure-memory/antagonist-agendas' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [],
        }),
      });
      return;
    }

    if (pathname === '/api/structure-memory/pov-permissions' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [],
        }),
      });
      return;
    }

    if (pathname === '/api/structure-memory/resource-continuities' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [],
        }),
      });
      return;
    }

    if (pathname === '/api/structure-memory/maintenance/guard-alerts' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          projectId: activeProjectId,
          scannedAt: '2026-04-16T09:50:00.000Z',
          trigger: 'project_scan',
          items: [],
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

  await page.getByRole('button', { name: '结构记忆' }).click();

  const foreshadowPanel = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: '把“埋了什么”升级成“什么时候动、怎么收”' }) })
    .first();

  await foreshadowPanel.scrollIntoViewIfNeeded();
  await expect(foreshadowPanel).toBeVisible();
  await expect(foreshadowPanel.getByText('后续 QuestionPool 落地后，再把相关未解问题关联补进来。')).toBeVisible();
  await expect.poll(() => questionPoolGetCount).toBeGreaterThan(0);

  await foreshadowPanel.getByRole('button', { name: '新建规划' }).click();
  await foreshadowPanel.getByLabel('关联伏笔').selectOption({ label: '黑铁片的真实来历' });
  await foreshadowPanel.getByLabel('类型').fill('主线伏笔');
  await foreshadowPanel.getByLabel('计划激活卷').fill('2');
  await foreshadowPanel.getByLabel('计划回收卷').fill('4');
  await foreshadowPanel.getByLabel('激活条件').fill('林冲确认归炉井入口被提前动过。');
  await foreshadowPanel.getByLabel('回收条件').fill('黑铁片在归炉前夜显出完整纹路。');
  await foreshadowPanel.getByLabel('回收效果').fill('把黑铁片从谜团升级为钥印主线。');
  await foreshadowPanel.getByRole('button', { name: '保存规划' }).click();

  await expect.poll(() => createRequests.length).toBe(1);
  expect(createRequests[0].projectId).toBeTruthy();
  expect(createRequests[0].foreshadowId).toBe('demo-foreshadow-origin');
  expect(createRequests[0].foreshadowTitle).toBe('黑铁片的真实来历');
  expect(createRequests[0].plannedActivateVolume).toBe(2);
  expect(createRequests[0].plannedResolveVolume).toBe(4);
  expect(createRequests[0].relatedQuestionIds).toEqual([]);
  expect(questionPoolMutationRequests).toEqual([]);

  await expect(foreshadowPanel.getByRole('button', { name: /黑铁片的真实来历/ })).toBeVisible();

  await foreshadowPanel.getByLabel('计划回收卷').fill('5');
  await foreshadowPanel.getByLabel('回收效果').fill('把黑铁片升级成第二卷核心钥印主线。');
  await foreshadowPanel.getByRole('button', { name: '保存规划' }).click();

  await expect.poll(() => updateRequests.length).toBe(1);
  expect(updateRequests[0].foreshadowPlanId).toBe('foreshadow-plan-created-1');
  expect(updateRequests[0].payload.projectId).toBe(activeProjectId);
  expect(updateRequests[0].payload.plannedResolveVolume).toBe(5);
  expect(updateRequests[0].payload.relatedQuestionIds).toEqual([]);
  expect(questionPoolMutationRequests).toEqual([]);
});
