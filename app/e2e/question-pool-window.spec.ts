import { expect, test, type Locator, type Page } from '@playwright/test';

test.setTimeout(120000);

test.use({
  viewport: {
    width: 1600,
    height: 1200,
  },
});

type QuestionPoolRequestPayload = {
  projectId?: string;
  question?: string;
  expectedRevealWindow?: string;
  currentClue?: string;
  status?: string;
};

type VolumeOutlineRequestPayload = {
  projectTitle?: string;
  volumeTitle?: string;
  volumeOrder?: number;
  questionPoolBundle?: string;
};

type CreateQuestionPoolInput = {
  question: string;
  expectedRevealWindow: string;
  currentClue: string;
};

async function openProjectList(page: Page) {
  const backButton = page.getByRole('button', { name: '返回项目列表' });

  if (await backButton.isVisible({ timeout: 1000 }).catch(() => false)) {
    await backButton.click();
    await expect(page.getByRole('heading', { name: '项目列表' })).toBeVisible();
  }
}

async function createQuestionPoolRecord(
  section: Locator,
  input: CreateQuestionPoolInput,
  waitForNextCreate: () => Promise<QuestionPoolRequestPayload>,
) {
  const questionInput = section.getByLabel('问题');
  const revealWindowInput = section.getByLabel('揭晓窗口');
  const currentClueInput = section.getByLabel('当前线索');
  const deleteButton = section.getByRole('button', { name: '删除问题' });
  const saveButton = section.getByRole('button', { name: '保存问题' });

  await section.getByRole('button', { name: '新建问题' }).click();
  await expect(questionInput).toHaveValue('');
  await expect(revealWindowInput).toHaveValue('');
  await expect(currentClueInput).toHaveValue('');
  await expect(deleteButton).toBeDisabled();

  await questionInput.fill(input.question);
  await revealWindowInput.fill(input.expectedRevealWindow);
  await currentClueInput.fill(input.currentClue);

  const nextCreate = waitForNextCreate();
  await saveButton.click();
  await nextCreate;

  await expect(section.locator('aside button').filter({ hasText: input.question }).first()).toBeVisible();
  await expect(questionInput).toHaveValue(input.question);
  await expect(saveButton).toBeEnabled();
}

test('QuestionPool.expectedRevealWindow 当前只稳定识别卷号，不把中段/末段/地点当成可靠自动判断', async ({ page }) => {
  const questionPoolGetRequests: Array<{
    projectId: string | null;
    currentVolumeOrder: string | null;
  }> = [];
  const createRequests: QuestionPoolRequestPayload[] = [];
  const volumeOutlineRequests: VolumeOutlineRequestPayload[] = [];
  let activeProjectId = 'demo-project';
  const createResolvers: Array<(payload: QuestionPoolRequestPayload) => void> = [];

  let questionPools: Array<Record<string, unknown>> = [];

  function waitForNextCreate() {
    return new Promise<QuestionPoolRequestPayload>((resolve) => {
      createResolvers.push(resolve);
    });
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
        body: JSON.stringify({ items: [] }),
      });
      return;
    }

    if (pathname === '/api/structure-memory/question-pools' && request.method() === 'GET') {
      questionPoolGetRequests.push({
        projectId: url.searchParams.get('projectId'),
        currentVolumeOrder: url.searchParams.get('currentVolumeOrder'),
      });

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: questionPools,
          alerts: [],
        }),
      });
      return;
    }

    if (pathname === '/api/structure-memory/question-pools' && request.method() === 'POST') {
      const payload = JSON.parse(request.postData() || '{}') as QuestionPoolRequestPayload;
      createRequests.push(payload);
      createResolvers.shift()?.(payload);

      if (typeof payload.projectId === 'string' && payload.projectId.trim()) {
        activeProjectId = payload.projectId;
      }

      const createdAt = `2026-04-16T10:0${createRequests.length}:00.000Z`;
      const item = {
        id: `question-pool-${createRequests.length}`,
        projectId: activeProjectId,
        question: String(payload.question ?? '').trim(),
        firstRaisedChapterId: null,
        firstRaisedAt: '',
        belongsToThreadId: null,
        belongsToThreadName: '',
        currentClue: String(payload.currentClue ?? '').trim(),
        falseAnswers: [],
        expectedRevealWindow: String(payload.expectedRevealWindow ?? '').trim(),
        finalAnswerSummary: '',
        status:
          payload.status === 'open' || payload.status === 'partial' || payload.status === 'answered'
            ? payload.status
            : 'open',
        createdAt,
        updatedAt: createdAt,
      };

      questionPools = [item, ...questionPools];

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ item }),
      });
      return;
    }

    if (pathname === '/api/structure-memory/antagonist-agendas' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [] }),
      });
      return;
    }

    if (pathname === '/api/structure-memory/pov-permissions' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [] }),
      });
      return;
    }

    if (pathname === '/api/structure-memory/resource-continuities' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [] }),
      });
      return;
    }

    if (pathname === '/api/structure-memory/guard-alerts' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          projectId: activeProjectId,
          scannedAt: '2026-04-16T10:00:00.000Z',
          trigger: 'project_scan',
          items: [],
        }),
      });
      return;
    }

    if (pathname === '/api/ai/volume-outline' && request.method() === 'POST') {
      const payload = JSON.parse(request.postData() || '{}') as VolumeOutlineRequestPayload;
      volumeOutlineRequests.push(payload);

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          goal: '验证 questionPoolBundle 只按卷号命中',
          keyConflict: '当前由 e2e mock 返回卷纲结果',
          arcSummary: '只有带明确卷号命中的未解问题会进入卷纲请求。',
          entryState: '主线仍在铺陈',
          exitState: '卷纲请求已被捕获',
          antagonist: '测试桩',
          subPlot: 'QuestionPool bundle 验证',
          inheritedThreads: [],
          protagonistGrowth: '无',
          emotionalArc: '无',
          estimatedWordCount: 120000,
          povPlan: '主角视角',
          keyEvents: ['验证 bundle'],
          foreshadowSeeds: [],
          requiredEntities: [],
          requiredForeshadows: [],
          estimatedChapterCount: 12,
          milestones: [],
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

  await page.getByRole('button', { name: '结构记忆', exact: true }).click();
  await expect(page.getByRole('heading', { name: '结构记忆统一工作台' })).toBeVisible();

  const questionPoolSection = page.locator('section#question-pool');
  await questionPoolSection.scrollIntoViewIfNeeded();
  await expect(questionPoolSection.getByText('未解问题池')).toBeVisible();
  await expect(questionPoolSection.getByText('卷纲生成会优先参考揭晓窗口已命中的未解问题。')).toBeVisible();

  const inputs: CreateQuestionPoolInput[] = [
    {
      question: '黑铁片会在承天城哪次试炼中再度失控？',
      expectedRevealWindow: '第1卷中段承天城',
      currentClue: '黑铁片在承天城附近开始持续发热。',
    },
    {
      question: '第二枚钥印会在何时确认归属？',
      expectedRevealWindow: '第二卷末',
      currentClue: '旧井深处已经传出第二枚钥印的回声。',
    },
    {
      question: '谢无咎何时公开承天城里的第二身份？',
      expectedRevealWindow: '第3卷中段承天城',
      currentClue: '他已经提前布了第二层假身份。',
    },
    {
      question: '茶铺老板何时认出主角真名？',
      expectedRevealWindow: '承天城末段',
      currentClue: '茶铺老板见过旧案卷宗上的署名。',
    },
    {
      question: '黑铁片何时首次对第二枚钥印产生稳定共鸣？',
      expectedRevealWindow: '',
      currentClue: '井口只留下断续嗡鸣，没有明确揭晓窗口。',
    },
  ];

  for (const input of inputs) {
    await createQuestionPoolRecord(questionPoolSection, input, waitForNextCreate);
  }

  expect(createRequests.map((item) => item.expectedRevealWindow)).toEqual([
    '第1卷中段承天城',
    '第二卷末',
    '第3卷中段承天城',
    '承天城末段',
    '',
  ]);
  expect(questionPoolGetRequests.some((item) => Boolean(item.projectId))).toBeTruthy();
  expect(questionPoolGetRequests.some((item) => Boolean(item.currentVolumeOrder))).toBeTruthy();

  await page.getByRole('button', { name: '创作工作台', exact: true }).click();
  await expect(page.getByRole('button', { name: '大纲', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '大纲', exact: true }).click();
  await expect(page.getByRole('button', { name: /第 2 卷 第二卷/ })).toBeVisible();
  await page.getByRole('button', { name: /第 2 卷 第二卷/ }).click();
  await expect(page.getByRole('button', { name: 'AI 生成卷大纲' }).first()).toBeVisible();

  await page.getByRole('button', { name: 'AI 生成卷大纲' }).first().click();

  await expect.poll(() => volumeOutlineRequests.length).toBe(1);
  await expect(page.getByText('验证 questionPoolBundle 只按卷号命中')).toBeVisible();

  const payload = volumeOutlineRequests[0];
  const questionPoolBundle = payload.questionPoolBundle ?? '';

  expect(payload.volumeOrder).toBe(2);
  expect(payload.volumeTitle).toBeTruthy();
  expect(questionPoolBundle).toContain('黑铁片会在承天城哪次试炼中再度失控？');
  expect(questionPoolBundle).toContain('预计揭晓窗口：第1卷中段承天城');
  expect(questionPoolBundle).not.toContain('第二枚钥印会在何时确认归属？');
  expect(questionPoolBundle).not.toContain('谢无咎何时公开承天城里的第二身份？');
  expect(questionPoolBundle).not.toContain('茶铺老板何时认出主角真名？');
  expect(questionPoolBundle).not.toContain('黑铁片何时首次对第二枚钥印产生稳定共鸣？');
  expect(questionPoolBundle).not.toContain('第二卷末');
  expect(questionPoolBundle).not.toContain('第3卷中段承天城');
  expect(questionPoolBundle).not.toContain('承天城末段');
});
