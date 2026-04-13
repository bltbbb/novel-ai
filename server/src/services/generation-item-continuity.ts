import type { ReviewIssue, StateChangeDraft } from '../types/ai.js';
import type { FoldedStateEntry } from './generation-state-table.js';

const ITEM_FIELD_PATTERNS = [
  /状态/u,
  /完整/u,
  /完整度/u,
  /可用/u,
  /灵性/u,
  /去向/u,
  /持有/u,
  /器身/u,
  /器魂/u,
  /部件/u,
];

const ITEM_UNAVAILABLE_PATTERNS = [
  /损毁/u,
  /损坏/u,
  /断裂/u,
  /折断/u,
  /碎成/u,
  /破碎/u,
  /崩裂/u,
  /裂开/u,
  /毁掉/u,
  /毁坏/u,
  /失灵/u,
  /失效/u,
  /灵性尽失/u,
  /不可用/u,
  /报废/u,
  /遗失/u,
  /丢失/u,
  /被夺/u,
  /被收走/u,
  /被拿走/u,
  /不在身边/u,
];

const ITEM_RECOVERY_PATTERNS = [
  /修好/u,
  /修复/u,
  /修补/u,
  /重铸/u,
  /重接/u,
  /续上/u,
  /补回/u,
  /取回/u,
  /找回/u,
  /夺回/u,
  /收回/u,
  /拾回/u,
  /换来/u,
  /借来/u,
];

const ITEM_TEMPORARY_RECOVERY_PATTERNS = [
  /暂时/u,
  /勉强/u,
  /短时/u,
  /片刻/u,
  /只能撑/u,
  /只能用/u,
  /只恢复/u,
  /几分/u,
  /三成/u,
  /半成/u,
];

const ITEM_USAGE_PATTERNS = [
  /祭出/u,
  /催动/u,
  /挥动/u,
  /挥出/u,
  /抖开/u,
  /卷出/u,
  /抽出/u,
  /取出/u,
  /握住/u,
  /握紧/u,
  /持着/u,
  /驱使/u,
  /运转/u,
  /启用/u,
  /再用/u,
  /再度使用/u,
  /再次使用/u,
  /施展/u,
  /发动/u,
];

const NEGATION_PATTERNS = [
  /不能/u,
  /不可/u,
  /无法/u,
  /没法/u,
  /尚未/u,
  /还没/u,
  /未能/u,
  /再也不能/u,
  /不能再/u,
  /不可再/u,
];

function normalizeText(value: string | null | undefined) {
  return (value ?? '').trim();
}

function buildChapterLabel(chapterOrder: number, chapterTitle: string) {
  if (chapterOrder <= 0) {
    return normalizeText(chapterTitle) || '未知章节';
  }

  const trimmedTitle = normalizeText(chapterTitle);
  const prefix = `第${chapterOrder}章`;

  if (trimmedTitle.startsWith(prefix)) {
    return trimmedTitle;
  }

  return `${prefix} ${trimmedTitle}`;
}

function splitSentences(text: string) {
  return text
    .split(/(?<=[。！？!?；;\n])/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function looksLikeTrackedItem(entry: FoldedStateEntry) {
  const field = normalizeText(entry.field);
  const currentValue = normalizeText(entry.currentValue);

  return (
    ITEM_FIELD_PATTERNS.some((pattern) => pattern.test(field)) &&
    ITEM_UNAVAILABLE_PATTERNS.some((pattern) => pattern.test(currentValue))
  );
}

function sentenceMentionsDirectUse(sentence: string, itemName: string) {
  if (!sentence.includes(itemName)) {
    return false;
  }

  if (NEGATION_PATTERNS.some((pattern) => pattern.test(sentence))) {
    return false;
  }

  return ITEM_USAGE_PATTERNS.some((pattern) => pattern.test(sentence));
}

function contentContainsRecovery(content: string, itemName: string) {
  return splitSentences(content).some(
    (sentence) =>
      sentence.includes(itemName) &&
      ITEM_RECOVERY_PATTERNS.some((pattern) => pattern.test(sentence)),
  );
}

function contentContainsTemporaryRecovery(content: string, itemName: string) {
  return splitSentences(content).some(
    (sentence) =>
      sentence.includes(itemName) &&
      ITEM_RECOVERY_PATTERNS.some((pattern) => pattern.test(sentence)) &&
      ITEM_TEMPORARY_RECOVERY_PATTERNS.some((pattern) => pattern.test(sentence)),
  );
}

function buildCandidateNewValue(content: string, itemName: string) {
  return contentContainsTemporaryRecovery(content, itemName)
    ? '暂时修复，可短时使用'
    : '已修复，可继续使用';
}

export function inferItemRepairStateChanges(input: {
  content: string;
  stateEntries: FoldedStateEntry[];
}) {
  const changes: StateChangeDraft[] = [];

  for (const entry of input.stateEntries) {
    if (!looksLikeTrackedItem(entry)) {
      continue;
    }

    const itemName = normalizeText(entry.entityName);

    if (!itemName || !contentContainsRecovery(input.content, itemName)) {
      continue;
    }

    changes.push({
      entityName: itemName,
      field: entry.field,
      oldValue: entry.currentValue,
      newValue: buildCandidateNewValue(input.content, itemName),
    });
  }

  return changes;
}

export function buildItemStateCandidateBlock(changes: StateChangeDraft[]) {
  if (changes.length === 0) {
    return '';
  }

  return [
    '【本章候选状态更新】',
    ...changes.map((change) => `- ${change.entityName} / ${change.field}：${change.oldValue} -> ${change.newValue}`),
  ].join('\n');
}

export function detectItemContinuityIssue(input: {
  content: string;
  stateEntries: FoldedStateEntry[];
}): ReviewIssue | null {
  const sentences = splitSentences(input.content);

  for (const entry of input.stateEntries) {
    if (!looksLikeTrackedItem(entry)) {
      continue;
    }

    const itemName = normalizeText(entry.entityName);

    if (!itemName) {
      continue;
    }

    if (contentContainsRecovery(input.content, itemName)) {
      continue;
    }

    const hasDirectUse = sentences.some((sentence) =>
      sentenceMentionsDirectUse(sentence, itemName),
    );

    if (!hasDirectUse) {
      continue;
    }

    return {
      severity: 'high',
      title: `关键物件连续性冲突：${itemName}`,
      description: `当前状态表已写明 ${itemName} 处于“损毁、遗失或失效”状态，但本章正文又直接让它恢复到可挥动、可祭出或可催动的使用态。`,
      suggestion: `若 ${itemName} 已恢复，必须补写修复、重铸、找回或重新取得的过程；否则应改成无法继续直接使用。`,
      evidence: `${buildChapterLabel(entry.chapterOrder, entry.chapterTitle)} 记录：${itemName} / ${entry.field} = ${entry.currentValue}`,
    };
  }

  return null;
}
