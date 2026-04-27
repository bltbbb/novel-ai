import { useEffect, useMemo, useState } from 'react';
import { BookOpen, CheckCircle2, CircleDashed, Lightbulb, LoaderCircle, Send, Sparkles, WandSparkles, X } from 'lucide-react';
import { streamChat } from '@/lib/ai-client';
import { db } from '@/lib/db';
import { createBookOutline, createInspirationBlueprint, createVolumeOutline, fetchDiscussTranscript } from '@/lib/generation-client';
import { createId } from '@/lib/identity';
import { normalizeLoreEntity } from '@/lib/lore-entity';
import { serializeBookOutline, serializeVolumeOutline } from '@/lib/outline-serializer';
import {
  resolveBookOutlineWithAiSummary,
  resolveVolumeOutlineWithAiSummary,
} from '@/lib/outline-summary-client';
import { buildModelRequestConfig } from '@/lib/runtime-config';
import { useForeshadowStore, useLoreStore, useOutlineStore, useProjectStore, useSettingsStore, useVolumeStore } from '@/stores';
import { useToast } from '@/components/Toast';
import type { AIChatRole, AIInspirationBlueprint, AIInspirationCoverage, VolumeOutlineFields } from '@/types';

interface InspirationDialogProps {
  open: boolean;
  onClose: () => void;
}

interface InspirationMessage {
  id: string;
  role: Extract<AIChatRole, 'user' | 'assistant'>;
  content: string;
}

interface InspirationVolumePlan {
  title: string;
  summary: string;
}

const DISCUSSION_PROJECT_ID = 'inspiration-lab';
const MAX_VOLUME_COUNT = 4;
const EMPTY_COVERAGE: AIInspirationCoverage = {
  coreHook: false,
  protagonistDrive: false,
  worldSlice: false,
  endgameConflict: false,
};

const DISCUSSION_SYSTEM_PROMPT = [
  '你是中文长篇小说的立项陪跑助手。',
  '当前任务不是写正文，而是和用户一起讨论一本新书的立项方向。',
  '每次回复都先简短总结目前已确认的信息，再提出 1 到 3 个最关键的问题。',
  '优先补齐：题材卖点、主角、目标、主冲突、世界规则、成长线、卷结构、开篇抓手。',
  '如果用户信息不足，可以提供 2 到 3 个可选方向帮助其决策。',
  '不要一次抛出太多问题，不要直接写成长篇成品，不要离题。',
].join('\n');

function buildTranscript(messages: InspirationMessage[]) {
  return messages
    .map((message) => `${message.role === 'user' ? '用户' : 'AI'}：${message.content.trim()}`)
    .join('\n\n');
}

function buildVolumeHint(plan: InspirationVolumePlan, blueprint: AIInspirationBlueprint) {
  return [
    blueprint.discussionSummary ? `立项总结：${blueprint.discussionSummary}` : '',
    plan.summary ? `当前卷设想：${plan.summary}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildChecklistItems(coverage: AIInspirationCoverage) {
  return [
    { key: 'coreHook', label: '核心卖点', done: coverage.coreHook },
    { key: 'protagonistDrive', label: '主角驱动力', done: coverage.protagonistDrive },
    { key: 'worldSlice', label: '世界切片', done: coverage.worldSlice },
    { key: 'endgameConflict', label: '终局冲突', done: coverage.endgameConflict },
  ];
}

function collectRequiredNames(volumeOutline: VolumeOutlineFields) {
  const requiredEntityNames = Array.from(
    new Set(
      [
        ...(volumeOutline.requiredEntities ?? []),
        ...volumeOutline.milestones.flatMap((milestone) => milestone.requiredEntities ?? []),
      ]
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
  const requiredForeshadowTitles = Array.from(
    new Set(
      [
        ...volumeOutline.foreshadowSeeds,
        ...(volumeOutline.requiredForeshadows ?? []),
        ...volumeOutline.milestones.flatMap((milestone) => [
          ...milestone.mustPlant,
          ...milestone.mustPayoff,
          ...(milestone.requiredForeshadows ?? []),
        ]),
      ]
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );

  return {
    requiredEntityNames,
    requiredForeshadowTitles,
  };
}

async function collectStreamText(
  serverUrl: string,
  request: Parameters<typeof streamChat>[1],
  onDelta?: (text: string) => void,
) {
  let fullText = '';

  for await (const delta of streamChat(serverUrl, request)) {
    fullText += delta;
    onDelta?.(fullText);
  }

  return fullText.trim();
}

export function InspirationDialog({ open, onClose }: InspirationDialogProps) {
  const settings = useSettingsStore((state) => state.settings);
  const createProject = useProjectStore((state) => state.createProject);
  const setActiveProject = useProjectStore((state) => state.setActiveProject);
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const createEntity = useLoreStore((state) => state.createEntity);
  const createForeshadow = useForeshadowStore((state) => state.createForeshadow);
  const loadVolumes = useVolumeStore((state) => state.loadVolumes);
  const updateVolume = useVolumeStore((state) => state.updateVolume);
  const createVolume = useVolumeStore((state) => state.createVolume);
  const saveBookOutline = useOutlineStore((state) => state.saveBookOutline);
  const saveVolumeOutline = useOutlineStore((state) => state.saveVolumeOutline);
  const { toast } = useToast();
  const [messages, setMessages] = useState<InspirationMessage[]>([]);
  const [draftInput, setDraftInput] = useState('');
  const [isDiscussing, setIsDiscussing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingDiscussTranscript, setIsLoadingDiscussTranscript] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [coverage, setCoverage] = useState<AIInspirationCoverage>(EMPTY_COVERAGE);
  const isBusy = isDiscussing || isGenerating || isLoadingDiscussTranscript;

  const canGenerateProject = useMemo(() => {
    return messages.some((message) => message.role === 'assistant' && message.content.trim());
  }, [messages]);
  const checklistItems = useMemo(() => buildChecklistItems(coverage), [coverage]);
  const isCoverageComplete = useMemo(() => checklistItems.every((item) => item.done), [checklistItems]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setMessages([]);
    setDraftInput('');
    setIsDiscussing(false);
    setIsGenerating(false);
    setIsLoadingDiscussTranscript(false);
    setProgressText('');
    setCoverage(EMPTY_COVERAGE);
  }, [open]);

  if (!open) {
    return null;
  }

  async function handleSendMessage() {
    const nextInput = draftInput.trim();

    if (!nextInput || isDiscussing || isGenerating) {
      return;
    }

    const userMessage: InspirationMessage = {
      id: createId(),
      role: 'user',
      content: nextInput,
    };
    const assistantId = createId();
    const nextMessages = [...messages, userMessage];

    setDraftInput('');
    setMessages([...nextMessages, {
      id: assistantId,
      role: 'assistant',
      content: '',
    }]);
    setIsDiscussing(true);

    try {
      await collectStreamText(settings.serverUrl, {
        projectId: DISCUSSION_PROJECT_ID,
        messages: nextMessages,
        systemPrompt: DISCUSSION_SYSTEM_PROMPT,
        ...buildModelRequestConfig(settings),
      }, (fullText) => {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content: fullText,
                }
              : message,
          ),
        );
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setMessages(nextMessages);
      setDraftInput(nextInput);
      toast(`讨论失败：${message}`, 'error');
    } finally {
      setIsDiscussing(false);
    }
  }

  async function generateProjectFromTranscript(transcript: string) {
    if (!transcript.trim() || isGenerating || isDiscussing) {
      return;
    }

    let createdProjectId: string | null = null;
    setIsGenerating(true);
    setProgressText('正在提炼立项摘要...');

    try {
      const blueprint = await createInspirationBlueprint(settings.serverUrl, {
        transcript: transcript.trim(),
        ...buildModelRequestConfig(settings),
      });
      setCoverage(blueprint.coverage);

      if (!Object.values(blueprint.coverage).every(Boolean)) {
        toast('当前立项信息仍偏少，但你仍可继续生成项目。', 'warning');
      }

      setProgressText('正在创建项目骨架...');
      const project = await createProject({
        title: blueprint.projectTitle,
        description: blueprint.projectDescription,
        genre: blueprint.genres,
        stylePrompt: blueprint.projectStylePrompt,
        seedEntities: blueprint.seedEntities.map((entity) => ({
          ...entity,
          pinned: entity.pinned ?? true,
          draft: typeof entity.draft === 'boolean' ? entity.draft : true,
        })),
      }, {
        activate: false,
      });
      createdProjectId = project.id;

      if (blueprint.seedForeshadows.length > 0) {
        setProgressText('正在写入初始伏笔...');

        for (const foreshadow of blueprint.seedForeshadows) {
          await createForeshadow({
            projectId: project.id,
            title: foreshadow.title,
            notes: foreshadow.notes,
            status: 'planted',
          });
        }
      }

      setProgressText('正在生成书纲...');
      const rawBookOutline = await createBookOutline(settings.serverUrl, {
        projectTitle: blueprint.projectTitle,
        projectDescription: blueprint.projectDescription,
        genre: blueprint.genres,
        hint: blueprint.bookOutlineHint || blueprint.discussionSummary,
        ...buildModelRequestConfig(settings),
      });
      const summarizedBookResult = await resolveBookOutlineWithAiSummary({
        serverUrl: settings.serverUrl,
        modelConfig: buildModelRequestConfig(settings),
        projectTitle: blueprint.projectTitle,
        projectDescription: blueprint.projectDescription,
        genre: blueprint.genres,
        fields: rawBookOutline,
      });

      if (summarizedBookResult.usedFallback) {
        toast(`书纲模型摘要失败，已回退本地摘要：${summarizedBookResult.errorMessage || '未知错误'}`, 'warning');
      }

      const bookOutline = summarizedBookResult.fields;
      await saveBookOutline(project.id, bookOutline);

      await loadVolumes(project.id);
      const volumePlans = blueprint.volumePlans.slice(0, MAX_VOLUME_COUNT);
      const existingVolumes = await db.volumes.where('projectId').equals(project.id).sortBy('order');

      if (existingVolumes[0]) {
        await updateVolume(existingVolumes[0].id, {
          title: volumePlans[0]?.title || '第一卷',
        });
      }

      for (let index = 1; index < volumePlans.length; index += 1) {
        await createVolume({
          projectId: project.id,
          title: volumePlans[index].title || `第${index + 1}卷`,
        });
      }

      const savedVolumes = await db.volumes.where('projectId').equals(project.id).sortBy('order');
      const serializedBookOutline = serializeBookOutline(bookOutline);
      let previousVolumeOutline = '';

      for (let index = 0; index < Math.min(savedVolumes.length, volumePlans.length); index += 1) {
        const volume = savedVolumes[index];
        const volumePlan = volumePlans[index];
        setProgressText(`正在生成第 ${index + 1} 卷卷纲...`);

        const rawVolumeOutline = await createVolumeOutline(settings.serverUrl, {
          projectTitle: blueprint.projectTitle,
          projectDescription: blueprint.projectDescription,
          bookOutline: serializedBookOutline,
          previousVolumeOutline: previousVolumeOutline || undefined,
          volumeTitle: volume.title,
          volumeOrder: index + 1,
          hint: buildVolumeHint(volumePlan, blueprint),
          ...buildModelRequestConfig(settings),
        });
        const summarizedVolumeResult = await resolveVolumeOutlineWithAiSummary({
          serverUrl: settings.serverUrl,
          modelConfig: buildModelRequestConfig(settings),
          projectTitle: blueprint.projectTitle,
          projectDescription: blueprint.projectDescription,
          volumeTitle: volume.title,
          volumeOrder: index + 1,
          bookOutlineSummary: bookOutline.summary,
          fields: rawVolumeOutline,
        });

        if (summarizedVolumeResult.usedFallback) {
          toast(`《${volume.title}》卷纲模型摘要失败，已回退本地摘要：${summarizedVolumeResult.errorMessage || '未知错误'}`, 'warning');
        }

        const generatedVolumeOutline = summarizedVolumeResult.fields;
        await saveVolumeOutline(project.id, volume.id, generatedVolumeOutline);
        const { requiredEntityNames, requiredForeshadowTitles } = collectRequiredNames(generatedVolumeOutline);
        const existingEntityRows = await db.entities.where('projectId').equals(project.id).toArray();
        const existingEntityNames = new Set(
          existingEntityRows.flatMap((rawEntity) => {
            const entity = normalizeLoreEntity(rawEntity);

            if (!entity) {
              return [] as string[];
            }

            return [entity.name, ...(entity.aliases ?? [])].map((item) => item.trim()).filter(Boolean);
          }),
        );
        const existingForeshadowRows = await db.foreshadows.where('projectId').equals(project.id).toArray();
        const existingForeshadowTitles = new Set(existingForeshadowRows.map((item) => item.title.trim()));

        for (const entityName of requiredEntityNames) {
          if (existingEntityNames.has(entityName)) {
            continue;
          }

          await createEntity({
            projectId: project.id,
            type: 'character',
            name: entityName,
            description: '',
            tags: ['#placeholder'],
            pinned: false,
            draft: true,
          });
          existingEntityNames.add(entityName);
        }

        for (const foreshadowTitle of requiredForeshadowTitles) {
          if (existingForeshadowTitles.has(foreshadowTitle)) {
            continue;
          }

          const matchedBlueprintForeshadow = blueprint.seedForeshadows.find((item) => item.title.trim() === foreshadowTitle);
          await createForeshadow({
            projectId: project.id,
            title: foreshadowTitle,
            notes: matchedBlueprintForeshadow?.notes || '',
            status: 'planted',
          });
          existingForeshadowTitles.add(foreshadowTitle);
        }
        previousVolumeOutline = serializeVolumeOutline(generatedVolumeOutline);
      }

      await loadProjects();
      setActiveProject(project.id);
      toast(`已根据灵感创建项目「${blueprint.projectTitle}」`, 'success');
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';

      if (createdProjectId) {
        await loadProjects();
        setActiveProject(createdProjectId);
        toast(`项目已创建，但后续结构生成失败：${message}`, 'warning');
      } else {
        toast(`生成项目失败：${message}`, 'error');
      }
    } finally {
      setIsGenerating(false);
      setProgressText('');
    }
  }

  async function handleGenerateProject() {
    if (messages.length === 0 || isBusy) {
      return;
    }

    await generateProjectFromTranscript(buildTranscript(messages));
  }

  async function handleGenerateFromDiscussFile() {
    if (isBusy) {
      return;
    }

    setIsLoadingDiscussTranscript(true);
    setProgressText('正在读取 discuss.txt...');

    try {
      const discussFile = await fetchDiscussTranscript(settings.serverUrl);
      await generateProjectFromTranscript(discussFile.transcript);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setProgressText('');
      toast(`读取 discuss.txt 失败：${message}`, 'error');
    } finally {
      setIsLoadingDiscussTranscript(false);
    }
  }

  function handleReset() {
    if (isBusy) {
      return;
    }

    setMessages([]);
    setDraftInput('');
    setProgressText('');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900 shadow-2xl shadow-black/40">
        <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-300">
              <Lightbulb size={18} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-neutral-100">灵感入口</h2>
              <p className="text-sm text-neutral-500">先聊一本新书，再一键沉淀成项目、书纲和卷纲。</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl p-2 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto px-6 py-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="flex min-h-0 flex-col rounded-3xl border border-neutral-800 bg-neutral-950/40">
            <div className="border-b border-neutral-800 px-5 py-4">
              <div className="flex items-center gap-2 text-sm font-medium text-neutral-200">
                <Sparkles size={15} className="text-amber-300" />
                立项讨论
              </div>
              <p className="mt-2 text-xs leading-6 text-neutral-500">
                先输入一个灵感，AI 会围绕卖点、主角、冲突、世界观和卷结构继续追问。
              </p>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
              {messages.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-950/60 px-4 py-5 text-sm leading-7 text-neutral-500">
                  例如：我想写一本“宗门经营 + 香火神道 + 家族成长”的长篇，主角不是传统天才，而是被推上神坛的边缘人。
                </div>
              ) : (
                messages.map((message) => (
                  <article
                    key={message.id}
                    className={`rounded-2xl border px-4 py-4 ${
                      message.role === 'user'
                        ? 'border-amber-500/30 bg-amber-500/10'
                        : 'border-neutral-800 bg-neutral-950/70'
                    }`}
                  >
                    <div className="mb-2 text-xs uppercase tracking-[0.18em] text-neutral-500">
                      {message.role === 'user' ? '你的想法' : '立项助手'}
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-7 text-neutral-200">{message.content || '...'}</p>
                  </article>
                ))
              )}
            </div>

            <div className="border-t border-neutral-800 px-5 py-5">
              <textarea
                value={draftInput}
                onChange={(event) => setDraftInput(event.target.value)}
                rows={5}
                placeholder="输入新的设想、回答 AI 的问题，或者补充你刚想到的设定。"
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm leading-7 text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-amber-500"
              />
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-neutral-500">
                  {progressText || (isCoverageComplete ? '立项核心信息已基本齐备，可以直接生成项目。' : '信息还可以继续补全，但你已经可以直接生成项目。')}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={isBusy}
                    className="rounded-2xl border border-neutral-700 px-4 py-2.5 text-sm text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    重置
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleGenerateFromDiscussFile()}
                    disabled={isBusy}
                    className="inline-flex items-center gap-2 rounded-2xl border border-neutral-700 px-4 py-2.5 text-sm text-neutral-200 transition-colors hover:border-neutral-600 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                    title="直接读取仓库根目录 discuss.txt，并按当前全局模型重新生成项目"
                  >
                    {isLoadingDiscussTranscript ? <LoaderCircle size={15} className="animate-spin" /> : <BookOpen size={15} />}
                    从 discuss.txt 直接生成
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleGenerateProject()}
                    disabled={!canGenerateProject || isBusy}
                    className="inline-flex items-center gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm font-medium text-amber-100 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isGenerating ? <LoaderCircle size={15} className="animate-spin" /> : <WandSparkles size={15} />}
                    {isGenerating ? '生成中...' : '生成项目'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSendMessage()}
                    disabled={!draftInput.trim() || isBusy}
                    className="inline-flex items-center gap-2 rounded-2xl bg-amber-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isDiscussing ? <LoaderCircle size={15} className="animate-spin" /> : <Send size={15} />}
                    {messages.length === 0 ? '开始讨论' : '继续讨论'}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-5">
            <div className="rounded-3xl border border-neutral-800 bg-neutral-950/40 p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-neutral-200">
                <Sparkles size={15} className="text-amber-300" />
                立项覆盖度
              </div>
              <div className="space-y-3">
                {checklistItems.map((item) => {
                  const Icon = item.done ? CheckCircle2 : CircleDashed;

                  return (
                    <div key={item.key} className="flex items-center justify-between rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm">
                      <span className="text-neutral-200">{item.label}</span>
                      <span className={`inline-flex items-center gap-2 ${item.done ? 'text-emerald-300' : 'text-neutral-500'}`}>
                        <Icon size={15} />
                        {item.done ? '已覆盖' : '待补充'}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs leading-6 text-neutral-500">
                checklist 会在点击“生成项目”时根据 blueprint 提炼结果更新，不会阻止你直接立项。
              </p>
            </div>

            <div className="rounded-3xl border border-neutral-800 bg-neutral-950/40 p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-neutral-200">
                <BookOpen size={15} className="text-amber-300" />
                这一步会产出什么
              </div>
              <div className="space-y-3 text-sm leading-7 text-neutral-400">
                <p>1. 把讨论结果提炼成项目标题、简介、题材标签和项目文风。</p>
                <p>2. 自动创建新项目，并把当前已经明确的核心角色与伏笔写入 Lore / Foreshadow。</p>
                <p>3. 自动生成书纲，再生成第一卷卷纲与阶段里程碑，作为后续章节裂变的起点。</p>
              </div>
            </div>

            <div className="rounded-3xl border border-neutral-800 bg-neutral-950/40 p-5">
              <div className="mb-3 text-sm font-medium text-neutral-200">推荐你在讨论里尽量讲清楚</div>
              <div className="space-y-3 text-sm leading-7 text-neutral-400">
                <p>主角是谁，他最想要什么，眼下卡在什么地方。</p>
                <p>这本书最吸引人的卖点是什么，读者为什么会追下去。</p>
                <p>世界规则和能力体系的大边界是什么，代价和上限在哪。</p>
                <p>前几卷大概要分别解决什么问题，人物关系会怎么升级或撕裂。</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
