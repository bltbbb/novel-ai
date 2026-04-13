import type {
  BookOutline,
  BookOutlineFields,
  VolumeMilestoneDraft,
  VolumeOutline,
  VolumeOutlineFields,
} from '@/types';

function formatList(title: string, values: string[]) {
  const sanitized = values.map((item) => item.trim()).filter(Boolean);

  if (sanitized.length === 0) {
    return '';
  }

  return [title, ...sanitized.map((item) => `- ${item}`)].join('\n');
}

function formatMilestones(milestones: VolumeMilestoneDraft[]) {
  const sanitized = milestones.filter(
    (milestone) =>
      milestone.title.trim() ||
      milestone.phaseGoal.trim() ||
      milestone.phaseConflict.trim() ||
      milestone.entryState.trim() ||
      milestone.exitState.trim() ||
      milestone.keyTurns.length > 0 ||
      milestone.mustPlant.length > 0 ||
      milestone.mustPayoff.length > 0 ||
      milestone.powerCeiling.trim() ||
      milestone.targetChapterCount > 0,
  );

  if (sanitized.length === 0) {
    return '';
  }

  return [
    '阶段里程碑：',
    ...sanitized.map((milestone, index) =>
      [
        `${index + 1}. ${milestone.title.trim() || `阶段${index + 1}`}`,
        milestone.targetChapterCount > 0 ? `  - 目标章数：${milestone.targetChapterCount}` : '',
        milestone.phaseGoal.trim() ? `  - 阶段目标：${milestone.phaseGoal.trim()}` : '',
        milestone.phaseConflict.trim() ? `  - 阶段冲突：${milestone.phaseConflict.trim()}` : '',
        milestone.entryState.trim() ? `  - 进入状态：${milestone.entryState.trim()}` : '',
        milestone.exitState.trim() ? `  - 结束状态：${milestone.exitState.trim()}` : '',
        milestone.powerCeiling.trim() ? `  - 能力上限：${milestone.powerCeiling.trim()}` : '',
        milestone.keyTurns.length > 0 ? `  - 关键转折：${milestone.keyTurns.join('；')}` : '',
        milestone.mustPlant.length > 0 ? `  - 必埋伏笔：${milestone.mustPlant.join('；')}` : '',
        milestone.mustPayoff.length > 0 ? `  - 必回收：${milestone.mustPayoff.join('；')}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    ),
  ].join('\n');
}

export function serializeSingleMilestone(milestone: VolumeMilestoneDraft, index?: number) {
  const title = milestone.title.trim() || (typeof index === 'number' ? `阶段${index + 1}` : '未命名阶段');

  return [
    `阶段标题：${title}`,
    milestone.targetChapterCount > 0 ? `目标章数：${milestone.targetChapterCount}` : '',
    milestone.phaseGoal.trim() ? `阶段目标：${milestone.phaseGoal.trim()}` : '',
    milestone.phaseConflict.trim() ? `阶段冲突：${milestone.phaseConflict.trim()}` : '',
    milestone.entryState.trim() ? `进入状态：${milestone.entryState.trim()}` : '',
    milestone.exitState.trim() ? `结束状态：${milestone.exitState.trim()}` : '',
    milestone.powerCeiling.trim() ? `能力上限：${milestone.powerCeiling.trim()}` : '',
    milestone.keyTurns.length > 0 ? `关键转折：${milestone.keyTurns.join('；')}` : '',
    milestone.mustPlant.length > 0 ? `必埋伏笔：${milestone.mustPlant.join('；')}` : '',
    milestone.mustPayoff.length > 0 ? `必回收：${milestone.mustPayoff.join('；')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function serializeBookOutline(outline: BookOutline | BookOutlineFields) {
  return [
    outline.premise.trim() ? `核心前提：${outline.premise.trim()}` : '',
    outline.centralConflict.trim() ? `主冲突：${outline.centralConflict.trim()}` : '',
    outline.protagonistArc.trim() ? `主角弧线：${outline.protagonistArc.trim()}` : '',
    outline.thematicCore.trim() ? `主题内核：${outline.thematicCore.trim()}` : '',
    formatList('世界规则：', outline.worldRules),
    outline.endgameHint.trim() ? `结局方向：${outline.endgameHint.trim()}` : '',
    outline.toneGuide.trim() ? `整体基调：${outline.toneGuide.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function serializeVolumeOutline(outline: VolumeOutline | VolumeOutlineFields) {
  return [
    outline.goal.trim() ? `本卷目标：${outline.goal.trim()}` : '',
    outline.keyConflict.trim() ? `核心冲突：${outline.keyConflict.trim()}` : '',
    outline.arcSummary.trim() ? `弧线概述：${outline.arcSummary.trim()}` : '',
    outline.entryState.trim() ? `卷初状态：${outline.entryState.trim()}` : '',
    outline.exitState.trim() ? `卷末状态：${outline.exitState.trim()}` : '',
    outline.estimatedChapterCount > 0 ? `预估总章数：${outline.estimatedChapterCount}` : '',
    formatList('关键事件：', outline.keyEvents),
    formatList('伏笔安排：', outline.foreshadowSeeds),
    formatMilestones(outline.milestones ?? []),
  ]
    .filter(Boolean)
    .join('\n');
}
