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

test('进入结构记忆工作台后可完成守护扫描、历史回填预览与写入刷新主链', async ({ page }) => {
  const previewRequests: Array<Record<string, unknown>> = [];
  const applyRequests: Array<Record<string, unknown>> = [];
  const guardRequestUrls: string[] = [];
  let activeProjectId = 'demo-project';
  let applyCompleted = false;
  let threadLedgerItems: Array<Record<string, unknown>> = [];

  function buildGuardAlertResult() {
    return {
      projectId: activeProjectId,
      scannedAt: applyCompleted ? '2026-04-16T09:48:00.000Z' : '2026-04-16T09:40:00.000Z',
      trigger: 'project_scan' as const,
      items: applyCompleted
        ? [
            {
              id: 'guard-alert-2',
              ruleKey: 'resource-continuity.missing-cost',
              trigger: 'project_scan' as const,
              severity: 'medium' as const,
              title: '资源代价未补齐',
              message: '“承天炉残火”已经进入正文，但资源连续性里还没有补充恢复条件。',
              evidence: '第19章摘要提到残火被再次点亮。',
              targetSystem: 'resource_continuity' as const,
              targetRecordId: null,
            },
          ]
        : [
            {
              id: 'guard-alert-1',
              ruleKey: 'thread-ledger.followup',
              trigger: 'project_scan' as const,
              severity: 'high' as const,
              title: '高热剧情线待补推进',
              message: '“黑铁片唤醒线”已经连续 4 章没有推进，建议尽快补一次明确推进。',
              evidence: '最近一次推进停留在第15章。',
              targetSystem: 'thread_ledger' as const,
              targetRecordId: null,
            },
            {
              id: 'guard-alert-2',
              ruleKey: 'resource-continuity.missing-cost',
              trigger: 'project_scan' as const,
              severity: 'medium' as const,
              title: '资源代价未补齐',
              message: '“承天炉残火”已经进入正文，但资源连续性里还没有补充恢复条件。',
              evidence: '第19章摘要提到残火被再次点亮。',
              targetSystem: 'resource_continuity' as const,
              targetRecordId: null,
            },
          ],
    };
  }

  function buildPreviewResult() {
    return {
      projectId: activeProjectId,
      generatedAt: applyCompleted ? '2026-04-16T09:47:00.000Z' : '2026-04-16T09:44:00.000Z',
      totalCandidates: 2,
      newCandidates: applyCompleted ? 0 : 1,
      existingCandidates: applyCompleted ? 2 : 1,
      counts: [
        {
          system: 'thread_ledger' as const,
          total: 1,
          newCount: applyCompleted ? 0 : 1,
          existingCount: applyCompleted ? 1 : 0,
        },
        {
          system: 'question_pool' as const,
          total: 1,
          newCount: 0,
          existingCount: 1,
        },
      ],
      candidates: [
        {
          candidateId: 'candidate-thread-1',
          system: 'thread_ledger' as const,
          status: applyCompleted ? ('existing' as const) : ('new' as const),
          title: '黑铁片唤醒线',
          scopeLabel: '第一卷 · 历史卷总结',
          summary: '旧卷线索已指向黑铁片再次被唤醒，建议补一条高热剧情线账本。',
          evidence: [
            {
              sourceType: 'volume_recap' as const,
              sourceLabel: '第一卷卷总结',
              excerpt: '黑铁片在卷末再次发热，主角决定继续追索来源。',
            },
          ],
        },
        {
          candidateId: 'candidate-question-1',
          system: 'question_pool' as const,
          status: 'existing' as const,
          title: '师门真相疑问',
          scopeLabel: '第一卷 · 未解问题',
          summary: '历史摘要里多次提到师门覆灭真相，当前未解问题已存在对应记录。',
          evidence: [
            {
              sourceType: 'chapter_summary' as const,
              sourceLabel: '第18章摘要',
              excerpt: '许明再次怀疑师门覆灭并非意外。',
            },
          ],
        },
      ],
    };
  }

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
          items: threadLedgerItems,
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
      guardRequestUrls.push(request.url());

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildGuardAlertResult()),
      });
      return;
    }

    if (pathname === '/api/structure-memory/maintenance/backfill-preview' && request.method() === 'POST') {
      const payload = JSON.parse(request.postData() || '{}') as Record<string, unknown>;

      if (typeof payload.projectId === 'string' && payload.projectId.trim()) {
        activeProjectId = payload.projectId;
      }

      previewRequests.push(payload);

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildPreviewResult()),
      });
      return;
    }

    if (pathname === '/api/structure-memory/maintenance/backfill-apply' && request.method() === 'POST') {
      const payload = JSON.parse(request.postData() || '{}') as Record<string, unknown>;

      if (typeof payload.projectId === 'string' && payload.projectId.trim()) {
        activeProjectId = payload.projectId;
      }

      applyRequests.push(payload);
      applyCompleted = true;
      threadLedgerItems = [
        {
          id: 'thread-ledger-1',
          projectId: activeProjectId,
          name: '黑铁片唤醒线',
          type: '主线',
          coreQuestion: '黑铁片为何会在卷末突然再次发热？',
          currentPhase: '已确认再次被唤醒，等待正式追索来源。',
          lastProgressAt: '第19章 黑铁片再次发热',
          lastProgressChapterId: 'demo-chapter-019',
          lastProgressChapterTitle: '第19章：炉火回响',
          lastProgressChapterOrder: 19,
          nextTrigger: '许明找到黑铁片旧主人的线索。',
          blockedBy: '尚未确认旧主人与量天司的关系。',
          relatedCharacterIds: [],
          relatedCharacterNames: ['许明'],
          relatedForeshadowIds: [],
          relatedForeshadowTitles: ['黑铁片来历'],
          plannedResolveVolume: 3,
          status: 'active',
          audienceHeat: 4,
          createdAt: '2026-04-16T09:46:00.000Z',
          updatedAt: '2026-04-16T09:46:00.000Z',
        },
      ];

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          projectId: activeProjectId,
          generatedAt: '2026-04-16T09:46:00.000Z',
          requestedCandidateCount: Array.isArray(payload.candidateIds) ? payload.candidateIds.length : 0,
          createdCount: 1,
          skippedExistingCount: 0,
          counts: [
            {
              system: 'thread_ledger',
              requestedCount: 1,
              createdCount: 1,
              skippedExistingCount: 0,
            },
          ],
          createdRecordIds: ['thread-ledger-1'],
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
  await expect(page.getByRole('heading', { name: '结构记忆统一工作台' })).toBeVisible();
  const alertIndexSection = page
    .locator('section')
    .filter({ has: page.getByText('统一提醒区') })
    .first();
  const previewSection = page
    .locator('section')
    .filter({ has: page.getByText('最近候选预览') })
    .first();
  const maintenanceSection = page
    .locator('section')
    .filter({ has: page.getByText('历史回填与守护任务') })
    .first();

  await expect.poll(() => guardRequestUrls.length).toBeGreaterThan(0);
  const initialGuardCallCount = guardRequestUrls.length;
  expect(new URL(guardRequestUrls[0]).searchParams.get('projectId')).toBeTruthy();
  await expect(alertIndexSection.getByRole('button', { name: /高热剧情线待补推进/ })).toBeVisible();

  await page.getByRole('button', { name: '预览历史回填' }).click();

  await expect.poll(() => previewRequests.length).toBe(1);
  expect(previewRequests[0]).toEqual({
    projectId: activeProjectId,
  });

  await expect(previewSection.getByRole('button', { name: /黑铁片唤醒线/ })).toBeVisible();
  await expect(previewSection.getByText('可写入')).toBeVisible();
  await expect(maintenanceSection.getByText(/剧情线账本 1\/1/)).toBeVisible();

  await page.getByRole('button', { name: '写入全部新候选' }).click();

  await expect.poll(() => applyRequests.length).toBe(1);
  expect(applyRequests[0].projectId).toBe(activeProjectId);
  expect(applyRequests[0].candidateIds).toEqual(['candidate-thread-1']);

  await expect.poll(() => previewRequests.length).toBe(2);
  await expect.poll(() => guardRequestUrls.length).toBeGreaterThan(initialGuardCallCount);
  const guardCountAfterApply = guardRequestUrls.length;

  await expect(maintenanceSection.getByText('最近一次预览生成于 2026-04-16T09:47:00.000Z')).toBeVisible();
  await expect(alertIndexSection.getByRole('button', { name: /高热剧情线待补推进/ })).toHaveCount(0);
  await expect(alertIndexSection.getByRole('button', { name: /资源代价未补齐/ })).toBeVisible();
  await expect(previewSection.getByRole('button', { name: /黑铁片唤醒线.*已存在/ })).toBeVisible();
  await expect(page.getByRole('button', { name: '写入全部新候选' })).toBeDisabled();
  await expect(page.getByRole('button', { name: /黑铁片唤醒线 活跃 热度 4/ })).toBeVisible();

  await page.getByRole('button', { name: '刷新守护告警' }).click();
  await expect.poll(() => guardRequestUrls.length).toBeGreaterThan(guardCountAfterApply);
});
