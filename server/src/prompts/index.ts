import fs from 'node:fs';
import path from 'node:path';
import type { PromptModuleHints, PromptModuleKey } from '../types/ai.js';
import { ANTI_AI_PROMPT } from './anti-ai-rules.js';
import { COOL_POINTS_PROMPT } from './cool-points.js';
import { CORE_CONSTRAINTS_PROMPT } from './core-constraints.js';
import { NO_POISON_PROMPT } from './no-poison.js';
import { STRAND_WEAVE_PROMPT } from './strand-weave.js';

export interface PromptConfig {
  enableCoreConstraints?: boolean;
  enableAntiAI?: boolean;
  enableStrandWeave?: boolean;
  enableCoolPoints?: boolean;
  enableNoPoison?: boolean;
}

export const DEFAULT_PROMPT_CONFIG: Required<PromptConfig> = {
  enableCoreConstraints: true,
  enableAntiAI: true,
  enableStrandWeave: true,
  enableCoolPoints: true,
  enableNoPoison: true,
};

export const WRITING_RULES_MARKER = '─── 以下为写作规则约束 ───';

export type GenerationWritingRulesStage =
  | 'plan'
  | 'write'
  | 'review'
  | 'language_qa'
  | 'style'
  | 'polish'
  | 'editor_refine'
  | 'extract';

const EXTRA_PREWRITE_PROMPT_MODULE_ORDER = ['strand_weave', 'cool_points'] as const satisfies readonly PromptModuleKey[];

function readPromptMarkdownFile(fileName: string, fallback: string) {
  const candidatePaths = [
    path.resolve(process.cwd(), fileName),
    path.resolve(process.cwd(), '..', fileName),
    path.resolve(process.cwd(), '..', '..', fileName),
  ];

  for (const fullPath of candidatePaths) {
    try {
      if (!fs.existsSync(fullPath)) {
        continue;
      }

      const text = fs.readFileSync(fullPath, 'utf8').trim();
      if (text) {
        return text;
      }
    } catch {
      continue;
    }
  }

  return fallback;
}

const BASE_SYSTEM_PROMPT = readPromptMarkdownFile(
  '写作规则-system-prompt.md',
  [CORE_CONSTRAINTS_PROMPT, ANTI_AI_PROMPT].join('\n\n'),
);
const STRAND_WEAVE_MODULE_PROMPT = readPromptMarkdownFile('写作规则-三线节奏模块.md', STRAND_WEAVE_PROMPT);
const NO_POISON_MODULE_PROMPT = readPromptMarkdownFile('写作规则-毒点规避模块.md', NO_POISON_PROMPT);
const COOL_POINTS_MODULE_PROMPT = readPromptMarkdownFile('写作规则-爽点逻辑模块.md', COOL_POINTS_PROMPT);
const STYLE_STAGE_SYSTEM_PROMPT = [
  '你是小说编辑，不负责续写、扩写或改剧情，只负责对既有正文做文风转译。',
  '硬性要求：',
  '1. 不得新增设定、改变事实、重排信息顺序、改动人物关系、状态和核心冲突。',
  '2. 只允许调整句式节奏、叙述口吻、描写重心、对白气口和开头结尾的收束方式。',
  '3. 若目标文风要求与事实护栏冲突，以事实护栏为准。',
  '4. 输出必须遵守调用方要求的 JSON 结构，不要输出 Markdown。',
].join('\n');
const POLISH_STAGE_SYSTEM_PROMPT = [
  '你是小说终稿编辑，不负责续写、扩写或重写剧情，只负责在既有正文上做定稿修订。',
  '硬性要求：',
  '1. 优先依据审查反馈和语言校对反馈修正文稿，但不得新增设定、改变事实、重排信息顺序或改动人物关系与核心冲突。',
  '2. 允许调整句式、措辞、节奏、段落衔接和局部表述，以提升自然度并削弱 AI 腔。',
  '3. 若反馈建议与定稿护栏冲突，以定稿护栏为准。',
  '4. 输出必须遵守调用方要求的 JSON 结构，不要输出 Markdown。',
].join('\n');
const REVIEW_STAGE_SYSTEM_PROMPT = [
  '你是小说审查编辑，不负责续写、改文或补剧情，只负责评估当前草稿是否达标。',
  '硬性要求：',
  '1. 以章节约束、状态信息和正文事实为准，只做审查判断，不提供改写后的正文。',
  '2. 重点发现一致性、连续性、追读动力、毒点和明显 AI 腔风险。',
  '3. 若正文与约束冲突，优先指出冲突，不要替作者脑补合理化解释。',
  '4. 输出必须遵守调用方要求的 JSON 结构，不要输出 Markdown。',
].join('\n');
const LANGUAGE_QA_STAGE_SYSTEM_PROMPT = [
  '你是小说语言校对编辑，不负责续写、改文或评价剧情节奏，只负责找语言层与局部逻辑层问题。',
  '硬性要求：',
  '1. 只报告错别字、病句、搭配错误、感官错配、指代错乱、称谓漂移、局部幻觉等细粒度问题。',
  '2. 不要把追读性、爽点密度、篇章结构这类审查层问题混进语言校对结果。',
  '3. 若没有明显问题，可以明确返回空 issues，不要为了凑问题而硬报。',
  '4. 输出必须遵守调用方要求的 JSON 结构，不要输出 Markdown。',
].join('\n');
const EXTRACT_STAGE_SYSTEM_PROMPT = [
  '你是章节结构化提取器，不负责续写、润色、审稿或脑补设定，只负责从正文中提取摘要、状态变更与 strand。',
  '硬性要求：',
  '1. 只依据正文和调用方提供的约束提取，不要发明正文里不存在的事件、能力、资源变化或关系变化。',
  '2. 若正文未明确写出变化，不要强行补写；若正文已明确写出变化，则必须完整提取。',
  '3. 摘要应忠于正文结果，状态变更应尽量具体、可追踪、可落库。',
  '4. 输出必须遵守调用方要求的 JSON 结构，不要输出 Markdown。',
].join('\n');
const EDITOR_REFINE_STAGE_SYSTEM_PROMPT = [
  '你是一名中文长篇小说的成稿润色编辑。',
  '请先审阅当前章节，再在不改变本章核心事实与章节功能的前提下完成润色。',
  '若调用方要求 JSON，则只输出合法 JSON；否则只输出润色后的正文。',
].join('\n');

function buildStageOnlySystemPrompt(prompt: string) {
  return `${WRITING_RULES_MARKER}\n${prompt}`;
}

function normalizePromptConfig(config?: Partial<PromptConfig>) {
  return {
    ...DEFAULT_PROMPT_CONFIG,
    ...config,
  };
}

function normalizeExtraPrewriteModules(values?: PromptModuleHints['extraPrewriteModules']) {
  const selectedModules = new Set<PromptModuleKey>();

  for (const value of values ?? []) {
    if (value === 'strand_weave' || value === 'cool_points') {
      selectedModules.add(value);
    }
  }

  return EXTRA_PREWRITE_PROMPT_MODULE_ORDER.filter((moduleKey) => selectedModules.has(moduleKey));
}

function buildWritingRulesSections(
  config: Partial<PromptConfig> | undefined,
  options?: {
    extraPrewriteModules?: PromptModuleHints['extraPrewriteModules'];
    includeNoPoison?: boolean;
  },
) {
  const normalizedConfig = normalizePromptConfig(config);
  const sections = [WRITING_RULES_MARKER];

  if (normalizedConfig.enableCoreConstraints || normalizedConfig.enableAntiAI) {
    sections.push(BASE_SYSTEM_PROMPT);
  }

  const extraPrewriteModules = normalizeExtraPrewriteModules(options?.extraPrewriteModules);

  for (const moduleKey of extraPrewriteModules) {
    if (moduleKey === 'strand_weave' && normalizedConfig.enableStrandWeave) {
      sections.push(STRAND_WEAVE_MODULE_PROMPT);
    }

    if (moduleKey === 'cool_points' && normalizedConfig.enableCoolPoints) {
      sections.push(COOL_POINTS_MODULE_PROMPT);
    }
  }

  if (options?.includeNoPoison && normalizedConfig.enableNoPoison) {
    sections.push(NO_POISON_MODULE_PROMPT);
  }

  return sections.join('\n\n').trim();
}

export function buildWritingRulesPrompt(config?: Partial<PromptConfig>) {
  const normalizedConfig = normalizePromptConfig(config);
  const extraPrewriteModules = [] as PromptModuleKey[];

  if (normalizedConfig.enableStrandWeave) {
    extraPrewriteModules.push('strand_weave');
  }

  if (normalizedConfig.enableCoolPoints) {
    extraPrewriteModules.push('cool_points');
  }

  return buildWritingRulesSections(config, {
    extraPrewriteModules,
    includeNoPoison: normalizedConfig.enableNoPoison,
  });
}

export function buildGenerationStageWritingRulesPrompt(
  config: Partial<PromptConfig> | undefined,
  input: {
    stage: GenerationWritingRulesStage;
    promptModuleHints?: PromptModuleHints | null;
  },
) {
  const normalizedConfig = normalizePromptConfig(config);

  if (input.stage === 'style') {
    return buildStageOnlySystemPrompt(STYLE_STAGE_SYSTEM_PROMPT);
  }

  if (input.stage === 'polish') {
    return buildStageOnlySystemPrompt(POLISH_STAGE_SYSTEM_PROMPT);
  }

  if (input.stage === 'language_qa') {
    return buildStageOnlySystemPrompt(LANGUAGE_QA_STAGE_SYSTEM_PROMPT);
  }

  if (input.stage === 'extract') {
    return buildStageOnlySystemPrompt(EXTRACT_STAGE_SYSTEM_PROMPT);
  }

  if (input.stage === 'editor_refine') {
    return buildStageOnlySystemPrompt(EDITOR_REFINE_STAGE_SYSTEM_PROMPT);
  }

  if (input.stage === 'review') {
    return buildStageOnlySystemPrompt(
      [REVIEW_STAGE_SYSTEM_PROMPT, normalizedConfig.enableNoPoison ? NO_POISON_MODULE_PROMPT : '']
        .filter(Boolean)
        .join('\n\n'),
    );
  }

  return buildWritingRulesSections(config, {
    extraPrewriteModules: input.stage === 'write' ? input.promptModuleHints?.extraPrewriteModules : undefined,
    includeNoPoison: false,
  });
}
