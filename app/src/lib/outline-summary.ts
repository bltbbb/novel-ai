import type { BookOutlineFields, VolumeMilestoneDraft, VolumeOutlineFields } from '@/types';

function normalizeInlineText(value: string | undefined | null) {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function truncateText(value: string, max = 72) {
  const normalized = normalizeInlineText(value);

  if (normalized.length <= max) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function pickFirstText(values: Array<string | undefined | null>) {
  return values.map((value) => normalizeInlineText(value)).find(Boolean) ?? '';
}

function buildSummary(lines: string[], maxLines = 4) {
  return lines
    .map((line) => normalizeInlineText(line))
    .filter(Boolean)
    .slice(0, maxLines)
    .join('\n');
}

export function buildBookOutlineSummary(fields: BookOutlineFields) {
  const keyRules = (fields.worldRules ?? [])
    .map((item) => normalizeInlineText(item))
    .filter(Boolean)
    .slice(0, 2);
  const keySubPlots = (fields.subPlots ?? [])
    .map((item) => normalizeInlineText(item))
    .filter(Boolean)
    .slice(0, 2);

  return buildSummary([
    pickFirstText([fields.logline, fields.premise])
      ? `故事核心：${truncateText(pickFirstText([fields.logline, fields.premise]))}`
      : '',
    fields.centralConflict ? `主线冲突：${truncateText(fields.centralConflict)}` : '',
    fields.protagonistArc ? `主角弧线：${truncateText(fields.protagonistArc)}` : '',
    fields.powerSystem ? `力量边界：${truncateText(fields.powerSystem, 64)}` : '',
    keyRules.length > 0 ? `世界规则：${truncateText(keyRules.join('；'), 64)}` : '',
    keySubPlots.length > 0 ? `副线抓手：${truncateText(keySubPlots.join('；'), 64)}` : '',
    fields.endgameHint ? `终局方向：${truncateText(fields.endgameHint, 64)}` : '',
    fields.toneGuide ? `整体基调：${truncateText(fields.toneGuide, 60)}` : '',
  ]);
}

export function buildVolumeMilestoneSummary(
  milestone: VolumeMilestoneDraft,
  milestoneIndex?: number | null,
) {
  const title =
    normalizeInlineText(milestone.title) ||
    (typeof milestoneIndex === 'number' ? `阶段 ${milestoneIndex + 1}` : '当前阶段');
  const keyTurns = (milestone.keyTurns ?? [])
    .map((item) => normalizeInlineText(item))
    .filter(Boolean)
    .slice(0, 2);
  const foreshadowHints = [
    ...(milestone.mustPlant ?? []),
    ...(milestone.mustPayoff ?? []),
  ]
    .map((item) => normalizeInlineText(item))
    .filter(Boolean)
    .slice(0, 2);

  return buildSummary([
    milestone.targetChapterCount > 0 ? `${title}：约 ${milestone.targetChapterCount} 章` : title,
    milestone.phaseGoal ? `阶段目标：${truncateText(milestone.phaseGoal)}` : '',
    milestone.phaseConflict ? `阶段冲突：${truncateText(milestone.phaseConflict)}` : '',
    milestone.entryState || milestone.exitState
      ? `状态推进：${truncateText(
          [
            milestone.entryState ? `从${normalizeInlineText(milestone.entryState)}` : '',
            milestone.exitState ? `到${normalizeInlineText(milestone.exitState)}` : '',
          ]
            .filter(Boolean)
            .join('，'),
          66,
        )}`
      : '',
    keyTurns.length > 0 ? `关键转折：${truncateText(keyTurns.join('；'), 66)}` : '',
    foreshadowHints.length > 0 ? `伏笔焦点：${truncateText(foreshadowHints.join('；'), 66)}` : '',
    milestone.powerCeiling ? `阶段边界：${truncateText(milestone.powerCeiling, 66)}` : '',
  ]);
}

export function buildVolumeOutlineSummary(fields: VolumeOutlineFields) {
  const keyEvents = (fields.keyEvents ?? [])
    .map((item) => normalizeInlineText(item))
    .filter(Boolean)
    .slice(0, 2);
  const phaseCount = fields.milestones?.length ?? 0;

  return buildSummary([
    fields.goal ? `本卷目标：${truncateText(fields.goal)}` : '',
    fields.keyConflict ? `核心冲突：${truncateText(fields.keyConflict)}` : '',
    fields.arcSummary ? `卷内弧线：${truncateText(fields.arcSummary)}` : '',
    fields.antagonist ? `明面对手：${truncateText(fields.antagonist, 64)}` : '',
    fields.protagonistGrowth ? `主角成长：${truncateText(fields.protagonistGrowth, 64)}` : '',
    fields.entryState || fields.exitState
      ? `状态变化：${truncateText(
          [
            fields.entryState ? `从${normalizeInlineText(fields.entryState)}` : '',
            fields.exitState ? `到${normalizeInlineText(fields.exitState)}` : '',
          ]
            .filter(Boolean)
            .join('，'),
          68,
        )}`
      : '',
    keyEvents.length > 0 ? `关键事件：${truncateText(keyEvents.join('；'), 68)}` : '',
    phaseCount > 0
      ? fields.estimatedChapterCount > 0
        ? `阶段切分：共 ${phaseCount} 个阶段，预估 ${fields.estimatedChapterCount} 章`
        : `阶段切分：共 ${phaseCount} 个阶段`
      : fields.estimatedChapterCount > 0
        ? `规模预估：约 ${fields.estimatedChapterCount} 章`
        : '',
  ]);
}

export function getBookOutlineSummary(fields: BookOutlineFields) {
  return fields.summary?.trim() || buildBookOutlineSummary(fields);
}

export function getVolumeOutlineSummary(fields: VolumeOutlineFields) {
  return fields.summary?.trim() || buildVolumeOutlineSummary(fields);
}

export function getVolumeMilestoneSummary(
  milestone: VolumeMilestoneDraft,
  milestoneIndex?: number | null,
) {
  return milestone.summary?.trim() || buildVolumeMilestoneSummary(milestone, milestoneIndex);
}
