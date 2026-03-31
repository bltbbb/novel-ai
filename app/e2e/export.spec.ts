import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

test.setTimeout(90000);

test('验证 Markdown 导出', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });

  const projectCard = page.getByText('最后一个修仙者').first();

  if (await projectCard.isVisible()) {
    await projectCard.click();
  }

  const chapterDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出章节' }).click();
  const chapterFile = await chapterDownload;
  const chapterPath = await chapterFile.path();

  if (!chapterPath) {
    throw new Error('未获取到章节导出文件路径');
  }

  const chapterContent = await readFile(chapterPath, 'utf8');

  expect(chapterFile.suggestedFilename()).toContain('最后一个修仙者');
  expect(chapterContent).toContain('# 第1章：废墟苏醒');
  expect(chapterContent).toContain('灵气枯竭之后，最后一名修仙者在废墟里醒来。');

  const projectDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出整书' }).click();
  const projectFile = await projectDownload;
  const projectPath = await projectFile.path();

  if (!projectPath) {
    throw new Error('未获取到整书导出文件路径');
  }

  const projectContent = await readFile(projectPath, 'utf8');

  expect(projectFile.suggestedFilename()).toBe('最后一个修仙者.md');
  expect(projectContent).toContain('# 最后一个修仙者');
  expect(projectContent).toContain('## 第1章：废墟苏醒');
});
