import { expect, test } from '@playwright/test';

test.setTimeout(120000);

function createSseResponse(chunks: string[]) {
  return [
    ...chunks.map((chunk) => `data: ${JSON.stringify({ delta: chunk, done: false })}\n\n`),
    `data: ${JSON.stringify({ delta: '', done: true })}\n\n`,
  ].join('');
}

test('验证灵感入口可完成立项并落下设定与伏笔', async ({ page }) => {
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

    if (url.pathname === '/api/ai/chat') {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: createSseResponse([
          '这个方向成立。当前已经比较明确的是：宗门经营、香火神道和边缘人成长这三个卖点可以并在一起。',
          '\n\n下一步我建议你继续明确主角最想先解决的现实问题，以及故事开篇要从哪个具体小场景切入。',
        ]),
      });
      return;
    }

    if (url.pathname === '/api/ai/inspiration-blueprint') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          projectTitle: '香火边缘人',
          projectDescription: '一个被推上神坛的边缘人，在破败宗门中靠香火与经营逆势翻盘。',
          genres: ['仙侠', '宗门经营'],
          projectStylePrompt: '保持冷峻克制，注重资源压力与宗门经营细节。',
          discussionSummary: '主角被迫接手破败宗门，以香火神道和经营手段重建势力，在各方博弈中一点点翻盘。',
          bookOutlineHint: '突出边缘人成神、宗门经营、香火体系与强敌压迫的长期升级线。',
          volumePlans: [
            { title: '第一卷 香火初燃', summary: '主角接手残破宗门，先稳住地盘和第一批香火来源。' },
          ],
          seedEntities: [
            {
              type: 'character',
              name: '陈烬',
              description: '被推上神坛的边缘人，谨慎而能算账。',
              tags: ['主角'],
              pinned: true,
            },
          ],
          seedForeshadows: [
            {
              title: '黑铁片的真实来历',
              notes: '这块残片与宗门旧神和被封存的井口有关。',
              linkedEntityNames: ['陈烬'],
            },
          ],
          coverage: {
            coreHook: true,
            protagonistDrive: true,
            worldSlice: true,
            endgameConflict: false,
          },
        }),
      });
      return;
    }

    if (url.pathname === '/api/ai/book-outline') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          premise: '边缘人被推上神坛，在破败宗门中靠香火与经营逆天改命。',
          centralConflict: '主角要在资源匮乏和外部压迫中，重建宗门并守住香火根基。',
          protagonistArc: '从被动接盘到主动掌局，逐步成长为能够改写宗门命运的人。',
          thematicCore: '代价、秩序与信仰。',
          subPlots: ['宗门人心线'],
          characterArcs: [
            {
              characterId: null,
              characterName: '陈烬',
              arc: '从被动接盘到主动掌局。',
            },
          ],
          powerSystem: '香火可以转化为力量，但伴随反噬与地脉消耗。',
          antagonistSystem: '外部势力与旧神残存秩序长期压迫宗门。',
          narrativeArc: '先站稳地盘，再扩大香火与宗门秩序，最后追到旧神真相。',
          logline: '边缘人被推上神坛后，只能靠香火经营与秩序重建逆势翻盘。',
          worldRules: ['香火可以转化为力量，但伴随反噬', '宗门地脉一旦失守就很难重建'],
          endgameHint: '最终会回到旧神与宗门根脉的真相。',
          toneGuide: '冷峻、克制、强调经营压力与慢热升级。',
        }),
      });
      return;
    }

    if (url.pathname === '/api/ai/volume-outline') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          goal: '稳住宗门地盘并点燃第一轮香火循环。',
          keyConflict: '主角既要对抗外部势力蚕食，也要解决宗门内部失序。',
          arcSummary: '从被迫接手到建立第一套可运行的香火与经营秩序。',
          entryState: '宗门破败，主角没有真正掌控权。',
          exitState: '主角初步坐稳位置，但更大势力已经盯上宗门。',
          antagonist: '蚕食宗门地盘的外部势力',
          subPlot: '旧神残片与宗门内部人心线并行推进。',
          inheritedThreads: [],
          protagonistGrowth: '主角从被推上台面转向主动掌局。',
          emotionalArc: '从孤立无援到拉起第一批愿意跟随的人。',
          estimatedWordCount: 180000,
          povPlan: '以陈烬主视角为主，不进入外部势力核心视角。',
          keyEvents: ['接手残破宗门', '找到第一批香火来源', '挡下第一次外部试探'],
          foreshadowSeeds: ['黑铁片的真实来历'],
          requiredEntities: ['陈烬', '李四'],
          requiredForeshadows: ['黑铁片的真实来历'],
          estimatedChapterCount: 36,
          milestones: [
            {
              title: '立足',
              targetChapterCount: 12,
              phaseGoal: '稳住宗门和主角的基本生存面。',
              phaseConflict: '宗门失序与外部压迫同时逼近。',
              entryState: '主角只是被推上前台的替代品。',
              exitState: '主角掌握了第一批香火和人手。',
              phasePacing: '蓄力',
              phaseEmotionShift: '从被动接盘转入谨慎立足。',
              phasePOV: '陈烬主视角',
              keyTurns: ['收拢第一批人心'],
              mustPlant: ['黑铁片的真实来历'],
              mustPayoff: [],
              powerCeiling: '只能先稳住局面，不能提前碾压强敌。',
              requiredEntities: ['陈烬', '李四'],
              requiredForeshadows: ['黑铁片的真实来历'],
            },
          ],
        }),
      });
      return;
    }

    await route.abort();
  });

  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });

  const backButton = page.getByRole('button', { name: '返回项目列表' });
  if (await backButton.isVisible().catch(() => false)) {
    await backButton.click();
  }

  await page.getByRole('button', { name: '灵感入口' }).click();
  await page.getByPlaceholder('输入新的设想、回答 AI 的问题，或者补充你刚想到的设定。').fill(
    '我想写一本宗门经营加香火神道的长篇，主角是个被推上神坛的边缘人。',
  );
  await page.getByRole('button', { name: '开始讨论' }).click();

  await expect(page.getByText('下一步我建议你继续明确主角最想先解决的现实问题')).toBeVisible();
  await page.getByRole('button', { name: '生成项目' }).click();

  await expect(page.getByRole('heading', { name: '香火边缘人' }).first()).toBeVisible();

  await page.getByRole('button', { name: '设定库' }).click();
  await expect(page.getByRole('button', { name: /陈烬/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /李四/ }).first()).toBeVisible();

  await page.getByRole('button', { name: '伏笔追踪' }).click();
  await expect(page.getByRole('heading', { name: '黑铁片的真实来历' })).toBeVisible();
});
