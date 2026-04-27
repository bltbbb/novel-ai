import type {
  BookOutline,
  BookOutlineFields,
  BookCharacterArcDraft,
  VolumeInheritedThreadDraft,
  VolumeMilestoneDraft,
  VolumeOutline,
  VolumeOutlineFields,
} from '@/types';
import { serializeForeshadowRef } from '@/lib/chapter-outline';

function formatList(title: string, values: string[]) {
  const sanitized = values.map((item) => item.trim()).filter(Boolean);

  if (sanitized.length === 0) {
    return '';
  }

  return [title, ...sanitized.map((item) => `- ${item}`)].join('\n');
}

function formatOptionalList(title: string, values?: string[]) {
  return formatList(title, values ?? []);
}

function formatStructuredForeshadowRefs(
  title: string,
  values?: VolumeMilestoneDraft['foreshadowRefs'] | VolumeOutlineFields['foreshadowRefs'],
) {
  const sanitized = (values ?? [])
    .map((item) => serializeForeshadowRef(item))
    .filter(Boolean);

  if (sanitized.length === 0) {
    return '';
  }

  return `${title}${sanitized.join('；')}`;
}

function formatCharacterArcs(title: string, values: BookCharacterArcDraft[]) {
  const sanitized = values
    .map((item) => {
      const characterName = item.characterName.trim();
      const arc = item.arc.trim();

      if (!characterName && !arc) {
        return '';
      }

      if (!characterName) {
        return arc;
      }

      return arc ? `${characterName}：${arc}` : characterName;
    })
    .filter(Boolean);

  return formatList(title, sanitized);
}

function formatInheritedThreads(title: string, values: VolumeInheritedThreadDraft[]) {
  const sanitized = values
    .map((item) => {
      const threadName = item.threadName.trim();
      const note = item.note.trim();

      if (!threadName && !note) {
        return '';
      }

      if (!threadName) {
        return note;
      }

      return note ? `${threadName}：${note}` : threadName;
    })
    .filter(Boolean);

  return formatList(title, sanitized);
}

function formatMilestones(milestones: VolumeMilestoneDraft[]) {
  const sanitized = milestones.filter(
    (milestone) =>
      milestone.title.trim() ||
      milestone.phaseGoal.trim() ||
      milestone.phaseConflict.trim() ||
      milestone.entryState.trim() ||
      milestone.exitState.trim() ||
      milestone.phasePacing.trim() ||
      milestone.phaseEmotionShift.trim() ||
      milestone.phasePOV.trim() ||
      milestone.keyTurns.length > 0 ||
      milestone.mustPlant.length > 0 ||
      milestone.mustPayoff.length > 0 ||
      (milestone.requiredEntities?.length ?? 0) > 0 ||
      (milestone.requiredForeshadows?.length ?? 0) > 0 ||
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
        milestone.phasePacing.trim() ? `  - 阶段节奏：${milestone.phasePacing.trim()}` : '',
        milestone.phaseEmotionShift.trim() ? `  - 情感变化：${milestone.phaseEmotionShift.trim()}` : '',
        milestone.phasePOV.trim() ? `  - 阶段视角：${milestone.phasePOV.trim()}` : '',
        milestone.powerCeiling.trim() ? `  - 能力上限：${milestone.powerCeiling.trim()}` : '',
        milestone.keyTurns.length > 0 ? `  - 关键转折：${milestone.keyTurns.join('；')}` : '',
        milestone.mustPlant.length > 0 ? `  - 必埋伏笔：${milestone.mustPlant.join('；')}` : '',
        milestone.mustPayoff.length > 0 ? `  - 必回收：${milestone.mustPayoff.join('；')}` : '',
        milestone.requiredEntities && milestone.requiredEntities.length > 0
          ? `  - 必需实体：${milestone.requiredEntities.join('；')}`
          : '',
        milestone.requiredForeshadows && milestone.requiredForeshadows.length > 0
          ? `  - 必需伏笔：${milestone.requiredForeshadows.join('；')}`
          : '',
        milestone.foreshadowRefs && milestone.foreshadowRefs.length > 0
          ? `  - 伏笔引用：${milestone.foreshadowRefs.map((item) => serializeForeshadowRef(item)).join('；')}`
          : '',
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
    milestone.phasePacing.trim() ? `阶段节奏：${milestone.phasePacing.trim()}` : '',
    milestone.phaseEmotionShift.trim() ? `情感变化：${milestone.phaseEmotionShift.trim()}` : '',
    milestone.phasePOV.trim() ? `阶段视角：${milestone.phasePOV.trim()}` : '',
    milestone.powerCeiling.trim() ? `能力上限：${milestone.powerCeiling.trim()}` : '',
    milestone.keyTurns.length > 0 ? `关键转折：${milestone.keyTurns.join('；')}` : '',
    milestone.mustPlant.length > 0 ? `必埋伏笔：${milestone.mustPlant.join('；')}` : '',
    milestone.mustPayoff.length > 0 ? `必回收：${milestone.mustPayoff.join('；')}` : '',
    formatOptionalList('必需实体：', milestone.requiredEntities),
    formatOptionalList('必需伏笔：', milestone.requiredForeshadows),
    formatStructuredForeshadowRefs('伏笔引用：', milestone.foreshadowRefs),
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
    formatList('副线规划：', outline.subPlots),
    formatCharacterArcs('角色弧线：', outline.characterArcs),
    outline.powerSystem.trim() ? `能力体系：${outline.powerSystem.trim()}` : '',
    outline.antagonistSystem.trim() ? `对抗体系：${outline.antagonistSystem.trim()}` : '',
    outline.narrativeArc.trim() ? `叙事弧线：${outline.narrativeArc.trim()}` : '',
    outline.logline.trim() ? `一句话卖点：${outline.logline.trim()}` : '',
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
    outline.antagonist.trim() ? `明面对手：${outline.antagonist.trim()}` : '',
    outline.subPlot.trim() ? `本卷暗线：${outline.subPlot.trim()}` : '',
    formatInheritedThreads('继承线头：', outline.inheritedThreads),
    outline.protagonistGrowth.trim() ? `主角成长：${outline.protagonistGrowth.trim()}` : '',
    outline.emotionalArc.trim() ? `情感推进：${outline.emotionalArc.trim()}` : '',
    outline.estimatedChapterCount > 0 ? `预估总章数：${outline.estimatedChapterCount}` : '',
    outline.estimatedWordCount > 0 ? `预估字数：${outline.estimatedWordCount}` : '',
    outline.povPlan.trim() ? `视角规划：${outline.povPlan.trim()}` : '',
    formatList('关键事件：', outline.keyEvents),
    formatList('伏笔安排：', outline.foreshadowSeeds),
    formatOptionalList('必需实体：', outline.requiredEntities),
    formatOptionalList('必需伏笔：', outline.requiredForeshadows),
    formatStructuredForeshadowRefs('伏笔引用：', outline.foreshadowRefs),
    formatMilestones(outline.milestones ?? []),
  ]
    .filter(Boolean)
    .join('\n');
}
