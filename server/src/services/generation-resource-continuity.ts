import type { ServerEnv } from '../config/env.js';
import type { ReviewIssue } from '../types/ai.js';
import { getGenerationDatabase } from './generation-sqlite.js';

interface ResourceRule {
  key: string;
  label: string;
  aliases: string[];
  unavailablePatterns: RegExp[];
  usagePatterns: RegExp[];
  recoveryPatterns: RegExp[];
}

export interface ResourceStateRow {
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  entityName: string;
  field: string;
  oldValue: string;
  newValue: string;
  updatedAt: string;
}

const RESOURCE_RULES: ResourceRule[] = [
  {
    key: 'salt',
    label: '盐',
    aliases: ['盐', '盐巴', '盐水'],
    unavailablePatterns: [/被扣/u, /扣走/u, /见底/u, /耗尽/u, /没了/u, /空了/u, /短缺/u],
    usagePatterns: [/(盐水|盐巴|拿出盐|舀盐|抓盐|撒盐|拿盐|用盐)/u],
    recoveryPatterns: [/(买回|换回|补到|借到|借来|赊来|藏着|余盐|剩盐|寻回|换来)/u],
  },
  {
    key: 'grain',
    label: '米粮',
    aliases: ['米', '粮', '米缸', '粮袋', '米汤', '粥'],
    unavailablePatterns: [/见底/u, /断粮/u, /耗尽/u, /空了/u, /没米/u, /没粮/u],
    usagePatterns: [/(米缸|淘米|煮粥|米汤|抓米|舀米|粮袋|熬粥)/u],
    recoveryPatterns: [/(买米|借粮|借来|赊来|补粮|换粮|余粮|剩米|抢回)/u],
  },
  {
    key: 'medicine',
    label: '伤药',
    aliases: ['药', '伤药', '药膏', '药粉', '纱布'],
    unavailablePatterns: [/见底/u, /耗尽/u, /用完/u, /没了/u, /断了/u],
    usagePatterns: [/(伤药|药膏|药粉|纱布|包扎|敷药|上药)/u],
    recoveryPatterns: [/(买药|借药|借来|赊来|补药|换药|剩药|存药|寻回)/u],
  },
  {
    key: 'money',
    label: '钱银',
    aliases: ['钱', '银', '铜钱', '银钱', '碎银'],
    unavailablePatterns: [/见底/u, /花光/u, /没钱/u, /空了/u, /被扣/u],
    usagePatterns: [/(掏钱|给钱|铜钱|碎银|银钱|付账|付钱)/u],
    recoveryPatterns: [/(赚到|换到|拿回|借到|借来|赊来|藏钱|余钱)/u],
  },
];

function normalizeText(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase();
}

function buildChapterLabel(chapterOrder: number, chapterTitle: string) {
  if (chapterOrder <= 0) {
    return chapterTitle.trim() || '未知章节';
  }

  const trimmedTitle = chapterTitle.trim();
  const prefix = `第${chapterOrder}章`;

  if (trimmedTitle.startsWith(prefix)) {
    return trimmedTitle;
  }

  return `${prefix} ${trimmedTitle}`;
}

function rowText(row: Pick<ResourceStateRow, 'entityName' | 'field' | 'oldValue' | 'newValue'>) {
  return [row.entityName, row.field, row.oldValue, row.newValue].join(' ');
}

function matchResourceRule(text: string) {
  const normalized = normalizeText(text);

  return (
    RESOURCE_RULES.find((rule) =>
      rule.aliases.some((alias) => normalized.includes(normalizeText(alias))),
    ) ?? null
  );
}

function resolveResourceRule(row: ResourceStateRow) {
  return matchResourceRule(rowText(row));
}

function looksUnavailable(row: ResourceStateRow, rule: ResourceRule) {
  const normalized = rowText(row);
  return rule.unavailablePatterns.some((pattern) => pattern.test(normalized));
}

function formatResourceChange(row: ResourceStateRow) {
  const chapterLabel = buildChapterLabel(row.chapterOrder, row.chapterTitle);
  return `${chapterLabel} ${row.entityName || '未命名资源'} / ${row.field || '状态'}：${row.oldValue || '未知'} -> ${row.newValue || '未知'}`;
}

export function loadResourceStateRows(env: ServerEnv, projectId: string) {
  const db = getGenerationDatabase(env);
  const rows = db
    .prepare(
      `
        SELECT
          changes.chapter_id,
          changes.chapter_title,
          COALESCE(idx.chapter_order, 0) AS chapter_order,
          changes.entity_name,
          changes.field,
          changes.old_value,
          changes.new_value,
          changes.updated_at
        FROM generation_state_changes changes
        LEFT JOIN generation_chapter_index idx
          ON idx.project_id = changes.project_id AND idx.chapter_id = changes.chapter_id
        WHERE changes.project_id = ?
        ORDER BY chapter_order DESC, changes.updated_at DESC
      `,
    )
    .all(projectId) as Array<Record<string, unknown>>;

  return rows
    .map(
      (row): ResourceStateRow => ({
        chapterId: String(row.chapter_id ?? ''),
        chapterTitle: String(row.chapter_title ?? ''),
        chapterOrder: Number(row.chapter_order ?? 0),
        entityName: String(row.entity_name ?? ''),
        field: String(row.field ?? ''),
        oldValue: String(row.old_value ?? ''),
        newValue: String(row.new_value ?? ''),
        updatedAt: String(row.updated_at ?? ''),
      }),
    )
    .filter((row) => resolveResourceRule(row) !== null);
}

export function buildResourceContinuityBlocks(
  rows: ResourceStateRow[],
  currentChapterOrder: number | null,
) {
  const historicalRows = rows
    .filter((row) => {
      if (currentChapterOrder === null) {
        return true;
      }

      return row.chapterOrder > 0 && row.chapterOrder < currentChapterOrder;
    })
    .sort((left, right) => {
      if (left.chapterOrder !== right.chapterOrder) {
        return right.chapterOrder - left.chapterOrder;
      }

      return right.updatedAt.localeCompare(left.updatedAt);
    });

  if (historicalRows.length === 0) {
    return [] as string[];
  }

  return historicalRows
    .slice(0, 6)
    .map((row) => `- ${formatResourceChange(row)}`);
}

export function detectResourceContinuityIssue(input: {
  content: string;
  chapterOrder?: number;
  resourceRows: ResourceStateRow[];
}): ReviewIssue | null {
  const latestUnavailableByRule = new Map<string, { rule: ResourceRule; row: ResourceStateRow }>();
  const currentChapterOrder = Math.trunc(input.chapterOrder ?? 0);
  const historicalRows = input.resourceRows
    .filter((row) => {
      if (currentChapterOrder <= 0) {
        return true;
      }

      return row.chapterOrder > 0 && row.chapterOrder < currentChapterOrder;
    })
    .sort((left, right) => {
      if (left.chapterOrder !== right.chapterOrder) {
        return left.chapterOrder - right.chapterOrder;
      }

      return left.updatedAt.localeCompare(right.updatedAt);
    });

  for (const row of historicalRows) {
    const rule = resolveResourceRule(row);

    if (!rule || !looksUnavailable(row, rule)) {
      continue;
    }

    latestUnavailableByRule.set(rule.key, { rule, row });
  }

  for (const { rule, row } of latestUnavailableByRule.values()) {
    const hasDirectUsage = rule.usagePatterns.some((pattern) => pattern.test(input.content));
    const hasRecovery = rule.recoveryPatterns.some((pattern) => pattern.test(input.content));

    if (!hasDirectUsage || hasRecovery) {
      continue;
    }

    return {
      severity: 'high',
      title: `资源连续性冲突：${rule.label}`,
      description: `前文已写明 ${rule.label} 处于“被扣、见底或耗尽”状态，本章却再次直接使用，疑似出现资源守恒错误。`,
      suggestion: `若 ${rule.label} 已恢复，必须补写明确来源、补给、找回或替代过程；否则应改成无法继续使用。`,
      evidence: `最近记录：${formatResourceChange(row)}`,
    };
  }

  return null;
}
