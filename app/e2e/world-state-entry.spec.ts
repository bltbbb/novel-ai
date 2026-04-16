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

test('WorldStateEntry 当前只支持卷级与里程碑级范围，保存 payload 不带 chapterId，同 scope 二次保存走更新', async ({ page }) => {
  const createRequests: Array<Record<string, unknown>> = [];
  const updateRequests: Array<{ worldStateEntryId: string; payload: Record<string, unknown> }> = [];
  let activeProjectId = 'demo-project';
  let worldStateEntries: Array<Record<string, unknown>> = [];

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
          items: worldStateEntries,
        }),
      });
      return;
    }

    if (pathname === '/api/structure-memory/world-state-entries' && request.method() === 'POST') {
      const payload = JSON.parse(request.postData() || '{}') as Record<string, unknown>;
      createRequests.push(payload);

      if (typeof payload.projectId === 'string' && payload.projectId.trim()) {
        activeProjectId = payload.projectId;
      }

      const item = {
        id: 'world-state-entry-created-1',
        projectId: activeProjectId,
        volumeId: String(payload.volumeId ?? ''),
        volumeTitle: String(payload.volumeTitle ?? ''),
        volumeOrder: typeof payload.volumeOrder === 'number' ? payload.volumeOrder : 1,
        milestoneIndex: typeof payload.milestoneIndex === 'number' ? payload.milestoneIndex : null,
        publicEvents: Array.isArray(payload.publicEvents) ? payload.publicEvents : [],
        secretEvents: Array.isArray(payload.secretEvents) ? payload.secretEvents : [],
        powerBalanceChange: String(payload.powerBalanceChange ?? ''),
        institutionChange: String(payload.institutionChange ?? ''),
        ruleChange: String(payload.ruleChange ?? ''),
        rumorState: String(payload.rumorState ?? ''),
        knownByCharacterIds: Array.isArray(payload.knownByCharacterIds) ? payload.knownByCharacterIds : [],
        knownByCharacterNames: Array.isArray(payload.knownByCharacterNames) ? payload.knownByCharacterNames : [],
        currentRisks: Array.isArray(payload.currentRisks) ? payload.currentRisks : [],
        createdAt: '2026-04-16T10:20:00.000Z',
        updatedAt: '2026-04-16T10:20:00.000Z',
      };

      worldStateEntries = [item];

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ item }),
      });
      return;
    }

    if (pathname.startsWith('/api/structure-memory/world-state-entries/') && request.method() === 'PUT') {
      const payload = JSON.parse(request.postData() || '{}') as Record<string, unknown>;
      const worldStateEntryId = decodeURIComponent(pathname.split('/').at(-1) || '');
      updateRequests.push({
        worldStateEntryId,
        payload,
      });

      const existing = worldStateEntries.find((item) => item.id === worldStateEntryId) ?? worldStateEntries[0];
      const item = {
        ...(existing ?? {}),
        id: worldStateEntryId,
        projectId: activeProjectId,
        volumeId: String(payload.volumeId ?? existing?.volumeId ?? ''),
        volumeTitle: String(payload.volumeTitle ?? existing?.volumeTitle ?? ''),
        volumeOrder:
          typeof payload.volumeOrder === 'number' ? payload.volumeOrder : (existing?.volumeOrder ?? 1),
        milestoneIndex:
          typeof payload.milestoneIndex === 'number'
            ? payload.milestoneIndex
            : ((payload.milestoneIndex as null | undefined) ?? existing?.milestoneIndex ?? null),
        publicEvents: Array.isArray(payload.publicEvents) ? payload.publicEvents : (existing?.publicEvents ?? []),
        secretEvents: Array.isArray(payload.secretEvents) ? payload.secretEvents : (existing?.secretEvents ?? []),
        powerBalanceChange: String(payload.powerBalanceChange ?? existing?.powerBalanceChange ?? ''),
        institutionChange: String(payload.institutionChange ?? existing?.institutionChange ?? ''),
        ruleChange: String(payload.ruleChange ?? existing?.ruleChange ?? ''),
        rumorState: String(payload.rumorState ?? existing?.rumorState ?? ''),
        knownByCharacterIds: Array.isArray(payload.knownByCharacterIds)
          ? payload.knownByCharacterIds
          : (existing?.knownByCharacterIds ?? []),
        knownByCharacterNames: Array.isArray(payload.knownByCharacterNames)
          ? payload.knownByCharacterNames
          : (existing?.knownByCharacterNames ?? []),
        currentRisks: Array.isArray(payload.currentRisks) ? payload.currentRisks : (existing?.currentRisks ?? []),
        createdAt: String(existing?.createdAt ?? '2026-04-16T10:20:00.000Z'),
        updatedAt: '2026-04-16T10:24:00.000Z',
      };

      worldStateEntries = [item];

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ item }),
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
          scannedAt: '2026-04-16T10:10:00.000Z',
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

  const worldStatePanel = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: '让世界真的随着卷与阶段继续变化' }) })
    .first();

  await worldStatePanel.scrollIntoViewIfNeeded();
  await expect(worldStatePanel).toBeVisible();
  await expect(worldStatePanel.getByText('第一版会保存卷级和里程碑级 delta。正文上下文当前默认消费“当前卷 + 前一卷”，里程碑覆盖位已预留。')).toBeVisible();

  const volumeSelect = worldStatePanel.locator('select').nth(0);
  const scopeSelect = worldStatePanel.locator('select').nth(1);

  await volumeSelect.selectOption({ index: 1 });
  await expect.poll(async () => await scopeSelect.locator('option').count()).toBeGreaterThan(1);

  const scopeOptions = await scopeSelect.locator('option').allTextContents();
  expect(scopeOptions).toContain('卷级默认状态');
  expect(scopeOptions.some((text) => text.includes('阶段 1'))).toBe(true);
  expect(scopeOptions.some((text) => text.includes('章节'))).toBe(false);

  await scopeSelect.selectOption({ index: 1 });
  await worldStatePanel.getByLabel('公开事件').fill('归炉井入口在第一卷末被再次惊动。');
  await worldStatePanel.getByLabel('秘密事件').fill('谢无咎提前留下了二次开启的试探。');
  await worldStatePanel.getByLabel('当前风险').fill('井底回声正在引来更多觊觎者。');
  await worldStatePanel.getByRole('button', { name: '保存状态' }).click();

  await expect.poll(() => createRequests.length).toBe(1);
  expect(createRequests[0].projectId).toBeTruthy();
  expect(createRequests[0].volumeTitle).toBe('第一卷');
  expect(createRequests[0].volumeOrder).toBe(1);
  expect(createRequests[0].milestoneIndex).toBe(0);
  expect(createRequests[0]).not.toHaveProperty('chapterId');

  await expect(worldStatePanel.getByRole('button', { name: /第一卷 · 阶段 1/ })).toBeVisible();

  await worldStatePanel.getByRole('button', { name: '新建状态' }).click();
  await volumeSelect.selectOption({ index: 1 });
  await expect.poll(async () => await scopeSelect.locator('option').count()).toBeGreaterThan(1);
  await scopeSelect.selectOption({ index: 1 });
  await worldStatePanel.getByLabel('公开事件').fill('归炉井入口在第一卷末已进入全面封锁。');
  await worldStatePanel.getByLabel('当前风险').fill('封锁升级后，外部势力会更快介入。');
  await worldStatePanel.getByRole('button', { name: '保存状态' }).click();

  await expect.poll(() => updateRequests.length).toBe(1);
  expect(createRequests).toHaveLength(1);
  expect(updateRequests[0].worldStateEntryId).toBe('world-state-entry-created-1');
  expect(updateRequests[0].payload.projectId).toBe(activeProjectId);
  expect(updateRequests[0].payload.milestoneIndex).toBe(0);
  expect(updateRequests[0].payload).not.toHaveProperty('chapterId');
  await expect(worldStatePanel.getByRole('button', { name: /第一卷 · 阶段 1/ })).toHaveCount(1);
});
