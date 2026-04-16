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

test('ThreadLedger 支持 GET/POST/PUT/DELETE 基本链路，并保留 dormant 高热线可见性', async ({ page }) => {
  const getRequests: Array<{
    projectId: string | null;
    currentChapterOrder: string | null;
    staleChapterGap: string | null;
  }> = [];
  const createRequests: Array<Record<string, unknown>> = [];
  const updateRequests: Array<{ threadLedgerId: string; payload: Record<string, unknown> }> = [];
  const deleteRequests: Array<{ threadLedgerId: string; projectId: string | null }> = [];
  let activeProjectId = 'demo-project';

  let threadLedgers = [
    {
      id: 'thread-dormant-1',
      projectId: activeProjectId,
      name: '旧皇城暗线',
      type: '暗线',
      coreQuestion: '旧皇城地契为何会在翻案前夜消失？',
      currentPhase: '线索暂时沉下去，但读者仍会记得这条线。',
      lastProgressAt: '第8章 旧皇城地契被提到',
      lastProgressChapterId: 'demo-chapter-008',
      lastProgressChapterTitle: '第8章：旧案回声',
      lastProgressChapterOrder: 8,
      nextTrigger: '许明找到地契残页。',
      blockedBy: '关键证人尚未现身。',
      relatedCharacterIds: [],
      relatedCharacterNames: ['许明'],
      relatedForeshadowIds: [],
      relatedForeshadowTitles: ['旧皇城印记'],
      plannedResolveVolume: 4,
      status: 'dormant' as const,
      audienceHeat: 4,
      createdAt: '2026-04-16T08:00:00.000Z',
      updatedAt: '2026-04-16T08:00:00.000Z',
    },
    {
      id: 'thread-resolved-1',
      projectId: activeProjectId,
      name: '盐案翻案线',
      type: '主线',
      coreQuestion: '盐案是否已经彻底洗清？',
      currentPhase: '已经在上一卷完成翻案并正式收束。',
      lastProgressAt: '第14章 盐案翻案完成',
      lastProgressChapterId: 'demo-chapter-014',
      lastProgressChapterTitle: '第14章：翻案落锤',
      lastProgressChapterOrder: 14,
      nextTrigger: '',
      blockedBy: '',
      relatedCharacterIds: [],
      relatedCharacterNames: ['许明'],
      relatedForeshadowIds: [],
      relatedForeshadowTitles: [],
      plannedResolveVolume: 2,
      status: 'resolved' as const,
      audienceHeat: 5,
      createdAt: '2026-04-16T08:10:00.000Z',
      updatedAt: '2026-04-16T08:10:00.000Z',
    },
  ];

  function buildThreadAlerts(currentChapterOrder: string | null) {
    if (!currentChapterOrder) {
      return [];
    }

    return [
      {
        threadLedgerId: 'thread-dormant-1',
        projectId: activeProjectId,
        name: '旧皇城暗线',
        lastProgressAt: '第8章 旧皇城地契被提到',
        lastProgressChapterOrder: 8,
        currentChapterOrder: Number(currentChapterOrder),
        overdueChapterCount: Math.max(0, Number(currentChapterOrder) - 8),
        staleChapterGap: 15,
        message: '休眠高热线仍需关注，建议尽快补一次推进。',
      },
    ];
  }

  await page.route('http://localhost:3001/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const requestProjectId = url.searchParams.get('projectId');

    if (requestProjectId) {
      activeProjectId = requestProjectId;
      threadLedgers = threadLedgers.map((item) => ({
        ...item,
        projectId: activeProjectId,
      }));
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
      const currentChapterOrder = url.searchParams.get('currentChapterOrder');
      const staleChapterGap = url.searchParams.get('staleChapterGap');

      getRequests.push({
        projectId: url.searchParams.get('projectId'),
        currentChapterOrder,
        staleChapterGap,
      });

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: threadLedgers,
          alerts: buildThreadAlerts(currentChapterOrder),
        }),
      });
      return;
    }

    if (pathname === '/api/structure-memory/thread-ledgers' && request.method() === 'POST') {
      const payload = JSON.parse(request.postData() || '{}') as Record<string, unknown>;
      createRequests.push(payload);

      if (typeof payload.projectId === 'string' && payload.projectId.trim()) {
        activeProjectId = payload.projectId;
      }

      const item = {
        id: 'thread-created-1',
        projectId: activeProjectId,
        name: String(payload.name ?? '').trim(),
        type: String(payload.type ?? '').trim(),
        coreQuestion: String(payload.coreQuestion ?? '').trim(),
        currentPhase: String(payload.currentPhase ?? '').trim(),
        lastProgressAt: String(payload.lastProgressAt ?? '').trim(),
        lastProgressChapterId: (payload.lastProgressChapterId as string | null | undefined) ?? null,
        lastProgressChapterTitle: String(payload.lastProgressChapterTitle ?? '').trim(),
        lastProgressChapterOrder:
          typeof payload.lastProgressChapterOrder === 'number' ? payload.lastProgressChapterOrder : null,
        nextTrigger: String(payload.nextTrigger ?? '').trim(),
        blockedBy: String(payload.blockedBy ?? '').trim(),
        relatedCharacterIds: Array.isArray(payload.relatedCharacterIds) ? payload.relatedCharacterIds : [],
        relatedCharacterNames: Array.isArray(payload.relatedCharacterNames) ? payload.relatedCharacterNames : [],
        relatedForeshadowIds: Array.isArray(payload.relatedForeshadowIds) ? payload.relatedForeshadowIds : [],
        relatedForeshadowTitles: Array.isArray(payload.relatedForeshadowTitles) ? payload.relatedForeshadowTitles : [],
        plannedResolveVolume:
          typeof payload.plannedResolveVolume === 'number' ? payload.plannedResolveVolume : null,
        status:
          payload.status === 'active' || payload.status === 'dormant' || payload.status === 'resolved'
            ? payload.status
            : 'active',
        audienceHeat: typeof payload.audienceHeat === 'number' ? payload.audienceHeat : 3,
        createdAt: '2026-04-16T09:00:00.000Z',
        updatedAt: '2026-04-16T09:00:00.000Z',
      };

      threadLedgers = [item, ...threadLedgers];

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ item }),
      });
      return;
    }

    if (pathname.startsWith('/api/structure-memory/thread-ledgers/') && request.method() === 'PUT') {
      const payload = JSON.parse(request.postData() || '{}') as Record<string, unknown>;
      const threadLedgerId = decodeURIComponent(pathname.split('/').at(-1) || '');
      updateRequests.push({
        threadLedgerId,
        payload,
      });

      const existing = threadLedgers.find((item) => item.id === threadLedgerId);
      const item = {
        ...(existing ?? threadLedgers[0]),
        projectId: activeProjectId,
        name: String(payload.name ?? existing?.name ?? '').trim(),
        type: String(payload.type ?? existing?.type ?? '').trim(),
        coreQuestion: String(payload.coreQuestion ?? existing?.coreQuestion ?? '').trim(),
        currentPhase: String(payload.currentPhase ?? existing?.currentPhase ?? '').trim(),
        lastProgressAt: String(payload.lastProgressAt ?? existing?.lastProgressAt ?? '').trim(),
        lastProgressChapterId:
          (payload.lastProgressChapterId as string | null | undefined) ?? existing?.lastProgressChapterId ?? null,
        lastProgressChapterTitle: String(payload.lastProgressChapterTitle ?? existing?.lastProgressChapterTitle ?? '').trim(),
        lastProgressChapterOrder:
          typeof payload.lastProgressChapterOrder === 'number'
            ? payload.lastProgressChapterOrder
            : existing?.lastProgressChapterOrder ?? null,
        nextTrigger: String(payload.nextTrigger ?? existing?.nextTrigger ?? '').trim(),
        blockedBy: String(payload.blockedBy ?? existing?.blockedBy ?? '').trim(),
        relatedCharacterIds: Array.isArray(payload.relatedCharacterIds)
          ? payload.relatedCharacterIds
          : (existing?.relatedCharacterIds ?? []),
        relatedCharacterNames: Array.isArray(payload.relatedCharacterNames)
          ? payload.relatedCharacterNames
          : (existing?.relatedCharacterNames ?? []),
        relatedForeshadowIds: Array.isArray(payload.relatedForeshadowIds)
          ? payload.relatedForeshadowIds
          : (existing?.relatedForeshadowIds ?? []),
        relatedForeshadowTitles: Array.isArray(payload.relatedForeshadowTitles)
          ? payload.relatedForeshadowTitles
          : (existing?.relatedForeshadowTitles ?? []),
        plannedResolveVolume:
          typeof payload.plannedResolveVolume === 'number'
            ? payload.plannedResolveVolume
            : existing?.plannedResolveVolume ?? null,
        status:
          payload.status === 'active' || payload.status === 'dormant' || payload.status === 'resolved'
            ? payload.status
            : (existing?.status ?? 'active'),
        audienceHeat:
          typeof payload.audienceHeat === 'number' ? payload.audienceHeat : (existing?.audienceHeat ?? 3),
        updatedAt: '2026-04-16T09:05:00.000Z',
      };

      threadLedgers = threadLedgers.map((candidate) => (candidate.id === threadLedgerId ? item : candidate));

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ item }),
      });
      return;
    }

    if (pathname.startsWith('/api/structure-memory/thread-ledgers/') && request.method() === 'DELETE') {
      const threadLedgerId = decodeURIComponent(pathname.split('/').at(-1) || '');

      deleteRequests.push({
        threadLedgerId,
        projectId: url.searchParams.get('projectId'),
      });

      threadLedgers = threadLedgers.filter((item) => item.id !== threadLedgerId);

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
      return;
    }

    if (pathname === '/api/structure-memory/foreshadow-plans' && request.method() === 'GET') {
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
          scannedAt: '2026-04-16T09:00:00.000Z',
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
  const threadPanel = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: '把长线推进从“记得住”变成“查得到”' }) })
    .first();

  await expect(threadPanel).toBeVisible();
  await expect.poll(() => getRequests.some((request) => Boolean(request.currentChapterOrder))).toBe(true);

  const requestWithChapterOrder = getRequests.find((request) => Boolean(request.currentChapterOrder));
  expect(requestWithChapterOrder?.projectId).toBeTruthy();
  expect(requestWithChapterOrder?.staleChapterGap).toBe('15');

  await expect(threadPanel.getByRole('button', { name: /旧皇城暗线/ })).toBeVisible();
  await expect(threadPanel.getByRole('button', { name: /盐案翻案线/ })).toBeVisible();
  const reminderCards = threadPanel.locator('div[class*="border-amber-500/30"]');
  await expect(threadPanel.getByText('休眠高热线仍需关注，建议尽快补一次推进。')).toBeVisible();
  await expect(reminderCards).toHaveCount(1);
  await expect(reminderCards.first()).not.toContainText('盐案翻案线');

  await threadPanel.getByRole('button', { name: '新建剧情线' }).click();
  await threadPanel.getByLabel('线名').fill('量天司追查线');
  await threadPanel.getByLabel('类型').fill('支线');
  await threadPanel.getByLabel('状态').selectOption('dormant');
  await threadPanel.getByLabel('读者期待度').selectOption('4');
  await threadPanel.getByLabel('核心问题').fill('量天司为何会提前盯上许明？');
  await threadPanel.getByLabel('当前阶段').fill('只知道量天司已经提前布线。');
  await threadPanel.getByLabel('预计收束卷').fill('5');
  await threadPanel.getByLabel('下一触发点').fill('许明查到量天司账册。');
  await threadPanel.getByLabel('当前卡点').fill('账册仍在内库，暂时拿不到。');
  await threadPanel.getByLabel('关联人物').fill('许明');
  await threadPanel.getByLabel('关联伏笔').fill('量天司腰牌');
  await threadPanel.getByRole('button', { name: '保存账本' }).click();

  await expect.poll(() => createRequests.length).toBe(1);
  expect(createRequests[0].projectId).toBeTruthy();
  expect(createRequests[0].name).toBe('量天司追查线');
  expect(createRequests[0].coreQuestion).toBe('量天司为何会提前盯上许明？');
  expect(createRequests[0].currentPhase).toBe('只知道量天司已经提前布线。');
  expect(createRequests[0].status).toBe('dormant');
  expect(createRequests[0].audienceHeat).toBe(4);
  expect(createRequests[0].plannedResolveVolume).toBe(5);

  await expect(threadPanel.getByRole('button', { name: /量天司追查线/ })).toBeVisible();

  await threadPanel.getByLabel('状态').selectOption('dormant');
  await threadPanel.getByLabel('读者期待度').selectOption('5');
  await threadPanel.getByLabel('当前阶段').fill('许明已经拿到量天司账册。');
  await threadPanel.getByRole('button', { name: '保存账本' }).click();

  await expect.poll(() => updateRequests.length).toBe(1);
  expect(updateRequests[0].threadLedgerId).toBe('thread-created-1');
  expect(updateRequests[0].payload.projectId).toBe(activeProjectId);
  expect(updateRequests[0].payload.currentPhase).toBe('许明已经拿到量天司账册。');
  expect(updateRequests[0].payload.status).toBe('dormant');
  expect(updateRequests[0].payload.audienceHeat).toBe(5);
  await expect(threadPanel.getByRole('button', { name: /量天司追查线/ })).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await threadPanel.getByRole('button', { name: '删除剧情线' }).click();

  await expect.poll(() => deleteRequests.length).toBe(1);
  expect(deleteRequests[0].threadLedgerId).toBe('thread-created-1');
  expect(deleteRequests[0].projectId).toBe(activeProjectId);
  await expect(threadPanel.getByRole('button', { name: /量天司追查线/ })).toHaveCount(0);
});
