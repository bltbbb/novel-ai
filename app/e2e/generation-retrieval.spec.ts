import { expect, test } from '@playwright/test';

test.setTimeout(120000);

test.use({
  viewport: {
    width: 1600,
    height: 1200,
  },
});

test('验证统一检索主链展示 memory chunk、休眠伏笔与卷总结', async ({ page }) => {
  const chapterId = 'demo-chapter';
  const chapterTitle = '第12章：黑铁片异动';
  const updatedAt = '2026-04-01T12:00:00.000Z';

  await page.route('http://localhost:3001/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;

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
          projectId: 'demo-project',
          counts: {
            generationJobs: 0,
            chapterSummaries: 1,
            stateChanges: 1,
            reviewMetrics: 0,
            entities: 1,
            relationships: 1,
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
              chapterOrder: 12,
              volumeTitle: '第一卷',
              previousChapterId: 'demo-prev',
              previousChapterTitle: '第11章：废墟低鸣',
              timeAnchor: '深夜',
              strand: 'quest',
              beatCount: 2,
              beats: ['黑铁片震动', '林冲想起旧线索'],
              immutableFacts: ['黑铁片不可损坏'],
              hookType: '悬念',
              hookStrength: 'strong',
              entitiesAppeared: ['林冲'],
              locations: ['废墟'],
              summaryExcerpt: '林冲发现黑铁片再次发出异动。',
              hook: '似乎与旧卷线索产生共鸣',
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

    if (pathname === '/api/runtime/generation-debug/relationships') {
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
          chapterOrder: 12,
          volumeTitle: '第一卷',
          previousChapterId: 'demo-prev',
          previousChapterTitle: '第11章：废墟低鸣',
          timeAnchor: '深夜',
          strand: 'quest',
          beatCount: 2,
          beats: ['黑铁片震动', '林冲想起旧线索'],
          immutableFacts: ['黑铁片不可损坏'],
          hookType: '悬念',
          hookStrength: 'strong',
          entitiesAppeared: ['林冲'],
          locations: ['废墟'],
          summaryExcerpt: '林冲发现黑铁片再次发出异动。',
          hook: '似乎与旧卷线索产生共鸣',
          foreshadowings: ['黑铁片'],
          review: null,
          updatedAt,
          stateChanges: [],
          relationships: [],
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
          chapterOrder: 12,
          bundle: 'retrieval_memory: 统一检索结果已注入',
          recentSummaryCount: 3,
          recentTextCount: 2,
          volumeRecapCount: 1,
          relatedChapterCount: 1,
          dormantForeshadowRecallCount: 1,
          volumeRecapRecallCount: 1,
          entityCount: 1,
          relationshipCount: 0,
          hasFallbackContext: false,
          focusEntityNames: ['林冲'],
          queryPhrases: ['黑铁片'],
          lightweightRecallItems: [
            {
              sourceType: 'dormant_foreshadow',
              title: '黑铁片首次发光',
              score: 8,
              matchedPhrases: ['黑铁片'],
              matchedEntities: ['林冲'],
              scoreBreakdown: {
                phrase: 2,
                entity: 3,
                recency: 3,
              },
              updatedAt,
              block: '- 休眠伏笔召回：黑铁片首次发光',
            },
            {
              sourceType: 'volume_recap',
              title: '第一卷',
              score: 6,
              matchedPhrases: ['黑铁片'],
              matchedEntities: [],
              scoreBreakdown: {
                phrase: 4,
                entity: 0,
                recency: 2,
              },
              updatedAt,
              block: '- 卷级总结召回：第一卷',
            },
          ],
          sections: [
            {
              key: 'retrieval_memory',
              title: '外部检索',
              blocks: [
                '- 第8章：黑铁片异响 / child #1',
                '- 休眠伏笔召回：黑铁片首次发光',
                '- 卷级总结召回：第一卷',
              ],
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
              chapterId: 'history-1',
              chapterTitle: '第8章：黑铁片异响',
              chapterOrder: 8,
              volumeTitle: '第一卷',
              chunkKind: 'child',
              sourceKind: 'scene',
              chunkIndex: 1,
              timeAnchor: '黄昏',
              summaryExcerpt: '黑铁片第一次异常震动。',
              tokenCount: 96,
              entityRefs: ['林冲'],
              locations: ['废墟'],
              content: '林冲在废墟边缘第一次听见黑铁片低鸣。',
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
          items: [
            {
              id: 'chunk-1',
              sourceType: 'memory_chunk',
              title: '第8章：黑铁片异响',
              chapterId: 'history-1',
              chapterTitle: '第8章：黑铁片异响',
              chapterOrder: 8,
              volumeTitle: '第一卷',
              chunkKind: 'child',
              sourceKind: 'scene',
              chunkIndex: 1,
              timeAnchor: '黄昏',
              summaryExcerpt: '黑铁片第一次异常震动。',
              entityRefs: ['林冲'],
              locations: ['废墟'],
              score: 14,
              matchedTerms: ['黑铁片'],
              matchedEntityNames: ['林冲'],
              matchedLocations: ['废墟'],
              contentExcerpt: '林冲在废墟边缘第一次听见黑铁片低鸣。',
              updatedAt,
              block: '- 第8章：黑铁片异响 / child #2\n命中词：黑铁片',
              scoreBreakdown: {
                sameVolume: 3,
                phrase: 6,
                entity: 4,
                location: 1,
                recency: 0,
                chunkKind: 0,
                embedding: 0,
              },
            },
            {
              id: 'foreshadow:1',
              sourceType: 'dormant_foreshadow',
              title: '黑铁片首次发光',
              chapterId: 'history-2',
              chapterTitle: '第3章：古井异象',
              chapterOrder: 3,
              volumeTitle: '',
              chunkKind: 'recall',
              sourceKind: 'dormant_foreshadow',
              chunkIndex: 0,
              timeAnchor: '',
              summaryExcerpt: '黑铁片在古井边第一次发光。',
              entityRefs: [],
              locations: [],
              score: 8,
              matchedTerms: ['黑铁片'],
              matchedEntityNames: ['林冲'],
              matchedLocations: [],
              contentExcerpt: '回收指向：第15章：真相揭露',
              updatedAt,
              block: '- 休眠伏笔召回：黑铁片首次发光\n回收指向：第15章：真相揭露',
              scoreBreakdown: {
                sameVolume: 0,
                phrase: 2,
                entity: 3,
                location: 0,
                recency: 3,
                chunkKind: 0,
                embedding: 0,
              },
            },
            {
              id: 'volume:1',
              sourceType: 'volume_recap',
              title: '第一卷',
              chapterId: 'history-3',
              chapterTitle: '第一卷',
              chapterOrder: 10,
              volumeTitle: '第一卷',
              chunkKind: 'recall',
              sourceKind: 'volume_recap',
              chunkIndex: 0,
              timeAnchor: '',
              summaryExcerpt: '林冲一路追查黑铁片来源。',
              entityRefs: [],
              locations: [],
              score: 6,
              matchedTerms: ['黑铁片'],
              matchedEntityNames: [],
              matchedLocations: [],
              contentExcerpt: '范围：第1-10章\n高亮：黑铁片来历未明',
              updatedAt,
              block: '- 卷级总结召回：第一卷\n范围：第1-10章',
              scoreBreakdown: {
                sameVolume: 0,
                phrase: 4,
                entity: 0,
                location: 0,
                recency: 2,
                chunkKind: 0,
                embedding: 0,
              },
            },
          ],
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

  const retrievalPanel = page.locator('div').filter({ has: page.getByText('检索候选') }).first();

  await expect(page.getByText('检索候选')).toBeVisible();
  await expect(retrievalPanel.locator('span').filter({ hasText: '记忆切片' }).first()).toBeVisible();
  await expect(retrievalPanel.locator('span').filter({ hasText: '休眠伏笔' }).first()).toBeVisible();
  await expect(retrievalPanel.locator('span').filter({ hasText: '卷总结' }).first()).toBeVisible();
  await expect(retrievalPanel.locator('p').filter({ hasText: /^黑铁片首次发光$/ }).first()).toBeVisible();
  await expect(retrievalPanel.getByText('第8章：黑铁片异响 / child #2', { exact: true })).toBeVisible();
  await expect(retrievalPanel.locator('pre').filter({ hasText: '回收指向：第15章：真相揭露' }).first()).toBeVisible();
  await expect(retrievalPanel.locator('pre').filter({ hasText: '范围：第1-10章' }).first()).toBeVisible();
  await expect(page.getByText('轻量召回排序')).toBeVisible();
});
