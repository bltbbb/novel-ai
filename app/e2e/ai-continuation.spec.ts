import { test, expect } from '@playwright/test';

test.setTimeout(90000);

test('验证 AI 续写最小闭环', async ({ page }) => {
  const requestFailures: Array<{ url: string; failure: string | null }> = [];

  page.on('requestfailed', (request) => {
    if (request.url().includes('/api/ai/chat')) {
      requestFailures.push({
        url: request.url(),
        failure: request.failure()?.errorText ?? null,
      });
    }
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

  await expect(page.getByRole('button', { name: '续写中...' })).toBeVisible({ timeout: 15000 });
  await expect
    .poll(async () => ((await editor.innerText()).trim().length), { timeout: 60000 })
    .toBeGreaterThan(beforeLength);
  await expect(page.getByRole('button', { name: 'AI 续写' })).toBeVisible({ timeout: 60000 });

  const afterText = (await editor.innerText()).trim();

  expect(requestFailures, JSON.stringify(requestFailures, null, 2)).toEqual([]);
  expect(afterText.length).toBeGreaterThan(beforeText.length);
});
