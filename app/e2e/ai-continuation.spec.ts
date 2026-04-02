import { test, expect } from '@playwright/test';

test.setTimeout(90000);

test('验证 AI 续写最小闭环', async ({ page }) => {
  const requestFailures: Array<{ url: string; failure: string | null }> = [];
  const chatRequests: Array<Record<string, unknown>> = [];

  page.on('requestfailed', (request) => {
    if (request.url().includes('/api/ai/chat')) {
      requestFailures.push({
        url: request.url(),
        failure: request.failure()?.errorText ?? null,
      });
    }
  });

  await page.route('http://localhost:3001/api/search', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        results: [],
      }),
    });
  });

  await page.route('http://localhost:3001/api/ai/chat', async (route) => {
    chatRequests.push(JSON.parse(route.request().postData() || '{}') as Record<string, unknown>);

    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream; charset=utf-8',
      headers: {
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
      body: [
        'data: {"delta":"他抬手拂去尘土，","done":false}',
        '',
        'data: {"delta":"黑铁片在掌心微微发烫。","done":false}',
        '',
        'data: {"delta":"","done":true}',
        '',
      ].join('\n'),
    });
  });

  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });

  const projectCard = page.getByText('最后一个修仙者').first();

  if (await projectCard.isVisible()) {
    await projectCard.click();
  }

  await expect(page.getByRole('button', { name: 'AI 续写' })).toBeVisible();

  const editor = page.locator('.ProseMirror');
  await expect(editor).toBeVisible();

  const beforeText = (await editor.innerText()).trim();
  const beforeLength = beforeText.length;

  await page.getByRole('button', { name: 'AI 续写' }).click();

  await expect.poll(() => chatRequests.length, { timeout: 15000 }).toBe(1);
  await expect
    .poll(async () => ((await editor.innerText()).trim().length), { timeout: 60000 })
    .toBeGreaterThan(beforeLength);
  await expect(page.getByRole('button', { name: 'AI 续写' })).toBeVisible({ timeout: 60000 });

  const afterText = (await editor.innerText()).trim();

  expect(chatRequests.length).toBe(1);
  expect(requestFailures, JSON.stringify(requestFailures, null, 2)).toEqual([]);
  expect(afterText.length).toBeGreaterThan(beforeText.length);
  expect(afterText).toContain('黑铁片在掌心微微发烫');
});
