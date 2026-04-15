import { expect, test } from '@playwright/test';

test.setTimeout(120000);

test('验证当前卷规划可生成修正建议并一键覆盖', async ({ page }) => {
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

    if (url.pathname === '/api/ai/volume-plan-reconcile') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          proposedVolumeOutline: {
            goal: '修正后的本卷目标：先稳住地盘，再把黑铁片线索推到台前。',
            keyConflict: '外部试探提前升级，主角必须更快建立秩序。',
            arcSummary: '从被动接盘修正为主动立规矩，并提前暴露黑铁片线索的重要性。',
            entryState: '主角尚未真正掌控局面。',
            exitState: '主角拿到第一轮主动权，但更大对手已经盯上他。',
            antagonist: '旧势力试探者',
            subPlot: '黑铁片线索提前进入台前。',
            inheritedThreads: [
              {
                threadId: null,
                threadName: '黑铁片线索',
                note: '上一阶段只做试探，这一卷要提前推到台前。',
              },
            ],
            protagonistGrowth: '从被动接盘转为主动立规矩。',
            emotionalArc: '主角与谢无咎从试探合作走向互相压迫。',
            estimatedWordCount: 120000,
            povPlan: '以主角视角为主，不进入外部试探者内心。',
            keyEvents: ['收拢第一批人心', '黑铁片异动暴露'],
            foreshadowSeeds: ['黑铁片的真实来历'],
            requiredEntities: ['林冲', '谢无咎'],
            requiredForeshadows: ['黑铁片的真实来历'],
            estimatedChapterCount: 20,
            milestones: [
              {
                title: '抢位',
                targetChapterCount: 8,
                phaseGoal: '主角先把宗门最低限度的秩序立起来。',
                phaseConflict: '旧势力和外部试探同时压上来。',
                entryState: '主角没有真正威信。',
                exitState: '主角拿到第一轮主导权。',
                phasePacing: '高压',
                phaseEmotionShift: '从被动承受到主动顶住。',
                phasePOV: '主角主视角',
                keyTurns: ['黑铁片第一次真正显露异动'],
                mustPlant: ['黑铁片的真实来历'],
                mustPayoff: [],
                powerCeiling: '只能抢到话语权，不能提前越级碾压。',
                requiredEntities: ['林冲', '谢无咎'],
                requiredForeshadows: ['黑铁片的真实来历'],
              },
            ],
          },
          proposedMilestones: [
            {
              title: '抢位',
              targetChapterCount: 8,
              phaseGoal: '主角先把宗门最低限度的秩序立起来。',
              phaseConflict: '旧势力和外部试探同时压上来。',
              entryState: '主角没有真正威信。',
              exitState: '主角拿到第一轮主导权。',
              phasePacing: '高压',
              phaseEmotionShift: '从被动承受到主动顶住。',
              phasePOV: '主角主视角',
              keyTurns: ['黑铁片第一次真正显露异动'],
              mustPlant: ['黑铁片的真实来历'],
              mustPayoff: [],
              powerCeiling: '只能抢到话语权，不能提前越级碾压。',
              requiredEntities: ['林冲', '谢无咎'],
              requiredForeshadows: ['黑铁片的真实来历'],
            },
          ],
          changeSummary: '已根据当前卷已有摘要，把本卷前段从“被动承受”修正为“主动抢位”。同时强化了黑铁片线索和谢无咎的提前压迫感。',
          riskNotes: ['如果后续正文继续偏移，仍需要再次校正阶段边界。'],
        }),
      });
      return;
    }

    await route.continue();
  });

  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });

  const backButton = page.getByRole('button', { name: '返回项目列表' });
  if (await backButton.isVisible().catch(() => false)) {
    await backButton.click();
  }

  await page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: '最后一个修仙者' }) })
    .first()
    .click();

  await expect(page.getByText('第 1 卷').first()).toBeVisible();
  await page.getByText('第 1 卷').first().click();
  await expect(page.getByRole('button', { name: '修正规划' }).first()).toBeVisible();
  await page.getByRole('button', { name: '修正规划' }).first().click();

  await expect(page.getByRole('heading', { name: '卷规划修正建议' })).toBeVisible();
  await expect(page.getByText('修正后的本卷目标：先稳住地盘，再把黑铁片线索推到台前。')).toBeVisible();
  await expect(page.getByText('风险提示')).toBeVisible();

  await page.getByRole('button', { name: '一键覆盖当前卷规划' }).click();

  await expect(page.getByRole('heading', { name: '卷规划修正建议' })).not.toBeVisible();
  await expect(page.getByText('修正后的本卷目标：先稳住地盘，再把黑铁片线索推到台前。').first()).toBeVisible();
});
