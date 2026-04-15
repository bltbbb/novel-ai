import { expect, test } from '@playwright/test';

test.setTimeout(120000);

test.use({
  viewport: {
    width: 1440,
    height: 1080,
  },
});

test('验证设置页可读取并保存轻量召回权重配置', async ({ page }) => {
  const savedConfigs: Array<Record<string, unknown>> = [];

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

    if (url.pathname === '/api/runtime/generation-gate') {
      if (request.method() === 'PUT') {
        const payload = JSON.parse(request.postData() || '{}') as Record<string, unknown>;
        savedConfigs.push(payload);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            config: payload,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          config: {
            reviewRewriteMinSeverity: 'critical',
            reviewMaxRewriteCount: 2,
            reviewScoreThresholds: {
              consistency: 60,
              continuity: 60,
              reader_pull: 55,
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

    if (url.pathname === '/api/runtime/ai-config') {
      if (request.method() === 'PUT') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            config: JSON.parse(request.postData() || '{}'),
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          config: {
            provider: 'openai',
            apiKey: 'test-key',
            baseUrl: 'https://api.openai.com/v1',
            defaultModel: 'gpt-5.4-mini',
            embeddingModel: '',
          },
        }),
      });
      return;
    }

    if (url.pathname === '/api/runtime/ai-models') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          models: [
            { id: 'gpt-5.4-mini' },
            { id: 'gpt-5.4' },
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

  await page.getByRole('button', { name: 'AI 设置' }).first().click();

  await expect(page.getByText('系统设置')).toBeVisible();
  await expect(page.getByText('已读取后端门控配置')).toBeVisible();
  await expect(page.getByText('轻量召回权重预设')).toBeVisible();
  await expect(page.getByLabel('轻量召回词命中权重')).toHaveValue('2');
  await expect(page.getByLabel('轻量召回实体命中权重')).toHaveValue('3');
  await expect(page.getByLabel('轻量召回时序权重')).toHaveValue('1');

  await page.getByRole('button', { name: '实体优先' }).click();
  await expect(page.getByLabel('轻量召回词命中权重')).toHaveValue('1');
  await expect(page.getByLabel('轻量召回实体命中权重')).toHaveValue('4');
  await expect(page.getByLabel('轻量召回时序权重')).toHaveValue('1');
  await page.evaluate(() => {
    const target = Array.from(document.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('保存后端配置'),
    ) as HTMLButtonElement | undefined;
    target?.click();
  });

  await expect.poll(() => savedConfigs.length).toBe(1);
  expect(savedConfigs[0]).toMatchObject({
    lightweightRecall: {
      minScore: 3,
      topK: 4,
      phraseWeight: 1,
      entityWeight: 4,
      recencyWeight: 1,
    },
  });
  await expect(page.locator('span').filter({ hasText: /^后端门控配置已保存$/ }).first()).toBeVisible();
});
