import { expect, test, type Locator, type Page } from '@playwright/test';

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

function buildThreadLedger(projectId: string) {
  return {
    id: 'thread-ledger-1',
    projectId,
    name: '黑铁片唤醒线',
    type: '主线',
    coreQuestion: '许明是否会继续追查黑铁片的真正来历？',
    currentPhase: '卷末确认黑铁片再次发热，下一步将追索旧主。 ',
    lastProgressAt: '第19章 黑铁片再次发热',
    lastProgressChapterId: 'demo-chapter-019',
    lastProgressChapterTitle: '第19章：炉火回响',
    lastProgressChapterOrder: 19,
    nextTrigger: '许明在承天城找到黑铁片旧主留下的痕迹。',
    blockedBy: '量天司还压着相关密档。',
    relatedCharacterIds: ['demo-character-xuming'],
    relatedCharacterNames: ['许明'],
    relatedForeshadowIds: ['demo-foreshadow-black-iron'],
    relatedForeshadowTitles: ['黑铁片来历'],
    plannedResolveVolume: 3,
    status: 'active' as const,
    audienceHeat: 4,
    createdAt: '2026-04-16T11:00:00.000Z',
    updatedAt: '2026-04-16T11:00:00.000Z',
  };
}

function buildForeshadowPlan(projectId: string) {
  return {
    id: 'foreshadow-plan-1',
    projectId,
    foreshadowId: 'demo-foreshadow-chengtian-flame',
    foreshadowTitle: '承天炉火种',
    type: '规则伏笔',
    importance: 'major' as const,
    plannedActivateVolume: 2,
    plannedResolveVolume: 4,
    activationCondition: '承天城地下炉阵再次被点亮时。',
    resolveCondition: '许明确认火种与黑铁片同源时。',
    dependsOnForeshadowIds: [],
    dependsOnForeshadowTitles: [],
    dependsOnEventKeys: ['chengtian-furnace-awake'],
    relatedQuestionIds: [],
    payoffEffect: '承天炉真正复燃，量天司旧账暴露。',
    createdAt: '2026-04-16T11:01:00.000Z',
    updatedAt: '2026-04-16T11:01:00.000Z',
  };
}

function buildWorldStateEntry(projectId: string) {
  return {
    id: 'world-state-entry-1',
    projectId,
    volumeId: 'demo-volume-1',
    volumeTitle: '第一卷',
    volumeOrder: 1,
    milestoneIndex: 0,
    publicEvents: ['承天城开始封炉，所有灵火外流被列为重罪。'],
    secretEvents: ['谢无咎提前试探了地下炉阵的第二重锁。'],
    powerBalanceChange: '承天司与量天司的权责边界开始重新切分。',
    institutionChange: '承天司临时接管城内灵火盘查。',
    ruleChange: '私藏炉火残焰会被直接视为叛逆协助。',
    rumorState: '城内开始流传“旧炉将醒”的说法。',
    knownByCharacterIds: ['demo-character-xuming'],
    knownByCharacterNames: ['许明'],
    currentRisks: ['承天炉残火外泄后，更多势力会同时盯上许明。'],
    createdAt: '2026-04-16T11:02:00.000Z',
    updatedAt: '2026-04-16T11:02:00.000Z',
  };
}

function buildQuestionPool(projectId: string) {
  return {
    id: 'question-pool-1',
    projectId,
    question: '师门覆灭幕后是谁？',
    firstRaisedChapterId: 'demo-chapter-004',
    firstRaisedAt: '第4章 承天城旧档案被提起',
    belongsToThreadId: 'thread-ledger-1',
    belongsToThreadName: '黑铁片唤醒线',
    currentClue: '承天城密档只提到“旧炉守门人”，没有落实名字。',
    falseAnswers: ['是旧掌炉使私自灭口', '是盐案旧仇延伸'],
    expectedRevealWindow: '第2卷中段承天城',
    finalAnswerSummary: '真正幕后与承天炉旧主和量天司旧账同时相关。',
    status: 'open' as const,
    createdAt: '2026-04-16T11:03:00.000Z',
    updatedAt: '2026-04-16T11:03:00.000Z',
  };
}

function buildAntagonistAgenda(projectId: string) {
  return {
    id: 'antagonist-agenda-1',
    projectId,
    characterEntityId: 'demo-character-xiewujiu',
    characterName: '谢无咎',
    publicRole: '承天司旧任掌炉官',
    hiddenAgenda: '借承天炉火种重启旧阵。',
    currentObjective: '逼许明继续追查黑铁片来源。',
    currentAction: '暗中释放火种残焰，引导许明暴露位置。',
    triggerToStrike: '许明公开提到承天炉旧主时。',
    bottomLine: '不能让旧阵彻底失控。',
    resourceBase: '残留掌炉令牌与旧部。',
    nextMoveWindow: '第2卷初到中段',
    intelligenceBlindSpot: '不知道黑铁片已经与许明气息绑定。',
    ifProtagonistDoesNothing: '会先从承天城内的旧部试探火种反应。',
    status: 'active' as const,
    createdAt: '2026-04-16T11:04:00.000Z',
    updatedAt: '2026-04-16T11:04:00.000Z',
  };
}

function buildPovPermission(projectId: string) {
  return {
    id: 'pov-permission-1',
    projectId,
    volumeId: 'demo-volume-1',
    volumeTitle: '第一卷',
    milestoneIndex: null,
    chapterId: null,
    chapterTitle: '',
    povCharacterId: 'demo-character-xuming',
    povCharacterName: '许明',
    readerKnows: ['许明已经确认黑铁片与承天炉有关。'],
    protagonistKnows: ['黑铁片会在承天炉附近产生共鸣。'],
    antagonistKnows: ['谢无咎知道许明接触过残火。'],
    mustHide: ['承天炉真正的旧主身份'],
    canHint: ['旧炉与师门覆灭并非两条独立线'],
    forbiddenReveal: ['黑铁片为何只对许明发热'],
    createdAt: '2026-04-16T11:05:00.000Z',
    updatedAt: '2026-04-16T11:05:00.000Z',
  };
}

function buildResourceContinuity(projectId: string) {
  return {
    id: 'resource-continuity-1',
    projectId,
    resourceType: '灵火',
    ownerCharacterId: 'demo-character-xuming',
    ownerCharacterName: '许明',
    currentState: '承天炉残火已被再次点燃。',
    performanceImpact: '灵火波动会暴露踪迹，且短时间内压不住旧阵回声。',
    lastConsumedAt: '第19章 炉火回响',
    recoveryCondition: '必须借黑铁片与旧炉残阵重新镇封。',
    hiddenCost: '每次点燃都会让许明更靠近旧主残念。',
    continuityRisk: '若继续外泄，承天城与量天司都会同时追来。',
    status: 'active' as const,
    riskLevel: 'high' as const,
    createdAt: '2026-04-16T11:06:00.000Z',
    updatedAt: '2026-04-16T11:06:00.000Z',
  };
}

async function expectSectionNearViewportTop(section: Locator) {
  await expect
    .poll(async () => {
      const box = await section.boundingBox();
      return box?.y ?? Number.POSITIVE_INFINITY;
    })
    .toBeLessThan(700);
}

async function readSectionTop(section: Locator) {
  const box = await section.boundingBox();
  return box?.y ?? Number.POSITIVE_INFINITY;
}

test('StructureWorkspaceIndex 补齐 T-A7 与 T-A9 的 UI 消费层：卡片、筛选、搜索、统一提醒与 guard 跳转', async ({
  page,
}) => {
  let activeProjectId = 'demo-project';

  const threadLedgers = [buildThreadLedger(activeProjectId)];
  const foreshadowPlans = [buildForeshadowPlan(activeProjectId)];
  const worldStateEntries = [buildWorldStateEntry(activeProjectId)];
  const questionPools = [buildQuestionPool(activeProjectId)];
  const antagonistAgendas = [buildAntagonistAgenda(activeProjectId)];
  const povPermissions = [buildPovPermission(activeProjectId)];
  const resourceContinuities = [buildResourceContinuity(activeProjectId)];

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
          items: threadLedgers.map((item) => ({ ...item, projectId: activeProjectId })),
          alerts: [
            {
              threadLedgerId: 'thread-ledger-1',
              projectId: activeProjectId,
              name: '黑铁片唤醒线',
              lastProgressAt: '第19章 黑铁片再次发热',
              lastProgressChapterOrder: 19,
              currentChapterOrder: 22,
              overdueChapterCount: 3,
              staleChapterGap: 2,
              message: '高热剧情线仍未推进，建议尽快补一次明确动作。',
            },
          ],
        }),
      });
      return;
    }

    if (pathname === '/api/structure-memory/foreshadow-plans' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: foreshadowPlans.map((item) => ({ ...item, projectId: activeProjectId })),
          alerts: [
            {
              foreshadowPlanId: 'foreshadow-plan-1',
              projectId: activeProjectId,
              foreshadowTitle: '承天炉火种',
              currentVolumeOrder: 2,
              overdueVolumeCount: 1,
              message: '火种已经到激活窗口，仍缺一次明确触发。',
            },
          ],
        }),
      });
      return;
    }

    if (pathname === '/api/structure-memory/world-state-entries' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: worldStateEntries.map((item) => ({ ...item, projectId: activeProjectId })),
        }),
      });
      return;
    }

    if (pathname === '/api/structure-memory/question-pools' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: questionPools.map((item) => ({ ...item, projectId: activeProjectId })),
          alerts: [
            {
              questionPoolId: 'question-pool-1',
              projectId: activeProjectId,
              question: '师门覆灭幕后是谁？',
              expectedRevealWindow: '第2卷中段承天城',
              currentVolumeOrder: 2,
              overdueVolumeCount: 0,
              message: '当前卷已经命中揭晓窗口，建议至少推进一次问题线索。',
            },
          ],
        }),
      });
      return;
    }

    if (pathname === '/api/structure-memory/antagonist-agendas' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: antagonistAgendas.map((item) => ({ ...item, projectId: activeProjectId })),
        }),
      });
      return;
    }

    if (pathname === '/api/structure-memory/pov-permissions' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: povPermissions.map((item) => ({ ...item, projectId: activeProjectId })),
        }),
      });
      return;
    }

    if (pathname === '/api/structure-memory/resource-continuities' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: resourceContinuities.map((item) => ({ ...item, projectId: activeProjectId })),
        }),
      });
      return;
    }

    if (pathname === '/api/structure-memory/maintenance/guard-alerts' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          projectId: activeProjectId,
          scannedAt: '2026-04-16T11:08:00.000Z',
          trigger: 'project_scan',
          items: [
            {
              id: 'guard-alert-question-1',
              ruleKey: 'question-pool.window-hit',
              trigger: 'project_scan',
              severity: 'medium',
              title: '揭晓窗口已到但仍无推进',
              message: '问题池里有一条已命中当前卷窗口的问题，建议马上补一次推进。',
              evidence: '当前卷已是第2卷，窗口写的是“第2卷中段承天城”。',
              targetSystem: 'question_pool',
              targetRecordId: 'question-pool-1',
            },
            {
              id: 'guard-alert-resource-1',
              ruleKey: 'resource-continuity.missing-cost',
              trigger: 'project_scan',
              severity: 'high',
              title: '资源代价未补齐',
              message: '承天炉残火已经进入正文，但连续性约束仍需要补恢复与代价。',
              evidence: '第19章 摘要直接提到残火再次点燃。',
              targetSystem: 'resource_continuity',
              targetRecordId: 'resource-continuity-1',
            },
          ],
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

  const searchSection = page
    .locator('section')
    .filter({ has: page.getByText('跨系统搜索') })
    .first();
  const alertSection = page
    .locator('section')
    .filter({ has: page.getByText('统一提醒区') })
    .first();
  const questionSection = page.locator('section#question-pool');
  const resourceSection = page.locator('section#resource-continuity');

  const cardLabels = [
    '剧情线账本',
    '伏笔规划',
    '世界状态',
    '未解问题',
    '反派议程',
    '信息权限',
    '资源连续性',
  ];
  const sectionSelectors = [
    '#thread-ledger',
    '#foreshadow-plan',
    '#world-state',
    '#question-pool',
    '#antagonist-agenda',
    '#pov-permission',
    '#resource-continuity',
  ];

  for (const label of cardLabels) {
    await expect(page.getByRole('button', { name: new RegExp(`^${label}`) }).first()).toBeVisible();
  }

  for (const selector of sectionSelectors) {
    await expect(page.locator(`section${selector}`)).toBeVisible();
  }

  await expect(alertSection.getByRole('button', { name: /黑铁片唤醒线/ })).toBeVisible();
  await expect(alertSection.getByRole('button', { name: /承天炉火种/ })).toBeVisible();
  await expect(alertSection.getByRole('button', { name: /师门覆灭幕后是谁？/ })).toBeVisible();
  await expect(alertSection.getByRole('button', { name: /资源代价未补齐/ })).toBeVisible();
  await expect(alertSection.getByRole('button', { name: /揭晓窗口已到但仍无推进/ })).toBeVisible();

  await searchSection.getByPlaceholder('搜索线名、伏笔、角色、卷名、代价、触发条件...').fill('承天');
  await expect(searchSection.getByRole('button', { name: /承天炉火种/ })).toBeVisible();
  await expect(searchSection.getByRole('button', { name: /第一卷 · 阶段 1/ })).toBeVisible();
  await expect(searchSection.getByRole('button', { name: /许明 · 灵火/ })).toBeVisible();

  const resourceSectionTopBeforeSearchOpen = await readSectionTop(resourceSection);
  await searchSection.getByRole('button', { name: /许明 · 灵火/ }).click();
  await expectSectionNearViewportTop(resourceSection);
  const resourceSectionTopAfterSearchOpen = await readSectionTop(resourceSection);
  expect(resourceSectionTopAfterSearchOpen).toBeLessThan(resourceSectionTopBeforeSearchOpen);

  await alertSection.scrollIntoViewIfNeeded();
  const questionSectionTopBeforeGuardOpen = await readSectionTop(questionSection);
  await alertSection.getByRole('button', { name: /揭晓窗口已到但仍无推进/ }).click();
  await expectSectionNearViewportTop(questionSection);
  const questionSectionTopAfterGuardOpen = await readSectionTop(questionSection);
  expect(questionSectionTopAfterGuardOpen).toBeLessThan(questionSectionTopBeforeGuardOpen);
  await expect(questionSection.getByRole('heading', { name: '未解问题' })).toBeVisible();

  await page.getByRole('button', { name: '只看有提醒' }).click();
  await expect(page.locator('section#thread-ledger')).toBeVisible();
  await expect(page.locator('section#foreshadow-plan')).toBeVisible();
  await expect(page.locator('section#question-pool')).toBeVisible();
  await expect(page.locator('section#resource-continuity')).toBeVisible();
  await expect(page.locator('section#world-state')).toHaveCount(0);
  await expect(page.locator('section#antagonist-agenda')).toHaveCount(0);
  await expect(page.locator('section#pov-permission')).toHaveCount(0);

  await page.getByRole('button', { name: '只看待同步' }).click();
  await expect(
    page.getByText('当前筛选下没有命中的结构记忆模块。可以切回“全部系统”，或者先处理待同步/提醒后再回来。'),
  ).toBeVisible();

  await page.getByRole('button', { name: '全部系统' }).click();
  await expect(page.locator('section#world-state')).toBeVisible();
  await expect(page.locator('section#antagonist-agenda')).toBeVisible();
  await expect(page.locator('section#pov-permission')).toBeVisible();
});
