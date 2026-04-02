import { test, expect } from '@playwright/test';

test.setTimeout(120000);

test.use({
  viewport: {
    width: 1600,
    height: 1200,
  },
});

test('验证生成控制台维护入口', async ({ page }) => {
  const chunkBackfillRequests: Array<Record<string, unknown>> = [];
  let activeProjectId = '';
  const chapterId = 'demo-chapter';
  const chapterTitle = '第1章：废墟苏醒';
  const updatedAt = '2026-04-01T09:00:00.000Z';

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

    if (pathname === '/api/generation/jobs') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ jobs: [] }),
      });
      return;
    }

    if (pathname === '/api/runtime/generation-gate') {
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

    if (pathname === '/api/runtime/generation-debug/overview') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          projectId: activeProjectId || 'demo-project',
          counts: {
            generationJobs: 0,
            chapterSummaries: 1,
            stateChanges: 1,
            reviewMetrics: 0,
            entities: 1,
            relationships: 1,
            foreshadows: 0,
            volumeRecaps: 1,
            chapterIndex: 1,
            memoryChunks: 2,
            memoryEmbeddings: 1,
          },
          recentJobs: [],
        }),
      });
      return;
    }

    if (pathname === '/api/runtime/generation-debug/chapters') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              chapterId,
              chapterTitle,
              chapterOrder: 1,
              volumeTitle: '第一卷',
              previousChapterId: '',
              previousChapterTitle: '',
              timeAnchor: '黎明',
              strand: 'quest',
              beatCount: 1,
              beats: ['林冲在废墟中醒来'],
              immutableFacts: ['灵气枯竭'],
              hookType: '悬念',
              hookStrength: 'strong',
              entitiesAppeared: ['林冲'],
              locations: ['废墟'],
              summaryExcerpt: '林冲在废墟中苏醒。',
              hook: '黑铁片忽然发光',
              foreshadowings: ['黑铁片'],
              review: null,
              updatedAt,
            },
          ],
        }),
      });
      return;
    }

    if (pathname === '/api/runtime/generation-debug/entities') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              entityName: '林冲',
              entityType: 'character',
              description: '青云门最后传人。',
              fields: {},
              tags: ['主角'],
              pinned: true,
              lastSeenChapterId: chapterId,
              lastSeenChapterTitle: chapterTitle,
              updatedAt,
            },
          ],
        }),
      });
      return;
    }

    if (pathname === '/api/runtime/generation-debug/relationships') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'relationship-1',
              sourceEntityName: '林冲',
              targetEntityName: '黑铁片',
              relationshipType: '持有',
              sourceKind: 'extract',
              description: '林冲持有黑铁片',
              evidence: '林冲握紧黑铁片',
              chapterId,
              chapterTitle,
              updatedAt,
            },
          ],
        }),
      });
      return;
    }

    if (pathname === '/api/runtime/generation-debug/foreshadows') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [],
        }),
      });
      return;
    }

    if (pathname === '/api/runtime/generation-debug/volume-recaps') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [],
        }),
      });
      return;
    }

    if (pathname === '/api/runtime/generation-debug/chapter-detail') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          chapterId,
          chapterTitle,
          chapterOrder: 1,
          volumeTitle: '第一卷',
          previousChapterId: '',
          previousChapterTitle: '',
          timeAnchor: '黎明',
          strand: 'quest',
          beatCount: 1,
          beats: ['林冲在废墟中醒来'],
          immutableFacts: ['灵气枯竭'],
          hookType: '悬念',
          hookStrength: 'strong',
          entitiesAppeared: ['林冲'],
          locations: ['废墟'],
          summaryExcerpt: '林冲在废墟中苏醒。',
          hook: '黑铁片忽然发光',
          foreshadowings: ['黑铁片'],
          review: null,
          updatedAt,
          stateChanges: [
            {
              id: 'state-change-1',
              entityName: '林冲',
              field: '位置',
              oldValue: '未知',
              newValue: '废墟',
              updatedAt,
            },
          ],
          relationships: [
            {
              id: 'relationship-1',
              sourceEntityName: '林冲',
              targetEntityName: '黑铁片',
              relationshipType: '持有',
              sourceKind: 'extract',
              description: '林冲持有黑铁片',
              evidence: '林冲握紧黑铁片',
              chapterId,
              chapterTitle,
              updatedAt,
            },
          ],
        }),
      });
      return;
    }

    if (pathname === '/api/runtime/generation-debug/context') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          chapterId,
          chapterTitle,
          chapterOrder: 1,
          bundle: 'working_memory: 林冲记得黑铁片曾在废墟中发光。',
          recentSummaryCount: 1,
          recentTextCount: 1,
          volumeRecapCount: 1,
          relatedChapterCount: 0,
          entityCount: 1,
          relationshipCount: 1,
          hasFallbackContext: false,
          focusEntityNames: ['林冲'],
          queryPhrases: ['黑铁片'],
          sections: [
            {
              key: 'working_memory',
              title: '工作记忆',
              blocks: ['林冲记得黑铁片曾在废墟中发光。'],
            },
          ],
        }),
      });
      return;
    }

    if (pathname === '/api/runtime/generation-debug/chunks') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'chunk-1',
              chapterId,
              chapterTitle,
              chapterOrder: 1,
              volumeTitle: '第一卷',
              chunkKind: 'parent',
              sourceKind: 'summary',
              chunkIndex: 0,
              timeAnchor: '黎明',
              summaryExcerpt: '林冲在废墟中苏醒。',
              tokenCount: 128,
              entityRefs: ['林冲'],
              locations: ['废墟'],
              content: '林冲在废墟中醒来，察觉黑铁片发光。',
              updatedAt,
            },
          ],
        }),
      });
      return;
    }

    if (pathname === '/api/runtime/generation-debug/retrieval') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          chapterId,
          chapterTitle,
          queryPhrases: ['黑铁片'],
          focusEntityNames: ['林冲'],
          items: [],
        }),
      });
      return;
    }

    if (pathname === '/api/runtime/generation-maintenance/backfill-memory-chunks' && request.method() === 'POST') {
      const payload = JSON.parse(request.postData() || '{}') as Record<string, unknown>;
      if (typeof payload.projectId === 'string') {
        activeProjectId = payload.projectId;
      }
      chunkBackfillRequests.push(payload);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          projectId: activeProjectId || 'demo-project',
          totalCandidates: 1,
          processedChapters: 1,
          skippedChapters: 0,
          missingContentChapters: 0,
          totalChunks: 2,
          parentChunks: 1,
          childChunks: 1,
          processedChapterIds: [chapterId],
        }),
      });
      return;
    }

    await route.abort();
  });

  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });

  const projectCard = page.getByText('最后一个修仙者').first();

  if (await projectCard.isVisible()) {
    await projectCard.click();
  }

  await page.getByRole('button', { name: '生成控制台' }).click();

  const maintenancePanel = page
    .getByText('维护入口')
    .locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');

  await expect(page.getByText('SQLite 调试面板')).toBeVisible();
  await expect(page.getByText('维护入口')).toBeVisible();
  await expect(
    page.locator('p').filter({ hasText: /^轻量召回权重：词 2 \/ 实体 3 \/ 时序 1$/ }).first(),
  ).toBeVisible();

  await page.evaluate(() => {
    const target = Array.from(document.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('回填记忆切片'),
    ) as HTMLButtonElement | undefined;
    target?.click();
  });

  await expect.poll(() => chunkBackfillRequests.length).toBe(1);

  expect(activeProjectId).not.toBe('');
  expect(chunkBackfillRequests[0]).toMatchObject({
    projectId: activeProjectId,
  });

});
