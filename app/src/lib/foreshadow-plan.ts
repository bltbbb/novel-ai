import type { ForeshadowPlan } from '@/types';

function normalizeText(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase();
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function buildVolumeForeshadowPlanBundle(input: {
  foreshadowPlans: ForeshadowPlan[];
  volumeOrder: number;
  requiredForeshadowTitles?: string[];
}) {
  const requiredTitleSet = new Set(
    (input.requiredForeshadowTitles ?? [])
      .map((item) => normalizeText(item))
      .filter(Boolean),
  );

  const matchedPlans = input.foreshadowPlans
    .filter((plan) => {
      if (plan.plannedActivateVolume === input.volumeOrder || plan.plannedResolveVolume === input.volumeOrder) {
        return true;
      }

      return requiredTitleSet.has(normalizeText(plan.foreshadowTitle));
    })
    .sort((left, right) => {
      if (left.importance !== right.importance) {
        return left.importance === 'major' ? -1 : 1;
      }

      const leftWindow = Math.min(left.plannedActivateVolume ?? Number.MAX_SAFE_INTEGER, left.plannedResolveVolume ?? Number.MAX_SAFE_INTEGER);
      const rightWindow = Math.min(right.plannedActivateVolume ?? Number.MAX_SAFE_INTEGER, right.plannedResolveVolume ?? Number.MAX_SAFE_INTEGER);

      if (leftWindow !== rightWindow) {
        return leftWindow - rightWindow;
      }

      return right.updatedAt.localeCompare(left.updatedAt);
    })
    .slice(0, 4);

  if (matchedPlans.length === 0) {
    return '';
  }

  return [
    `【本卷伏笔规划】当前为第 ${input.volumeOrder} 卷，以下伏笔计划与本卷窗口直接相关：`,
    ...matchedPlans.map((plan) => {
      const lines = [
        `- ${plan.foreshadowTitle}（${plan.type || '未分类'} / ${plan.importance === 'major' ? '核心伏笔' : '次级伏笔'}）`,
      ];

      if (plan.activationWindow?.trim()) {
        lines.push(`激活窗口：${truncateText(plan.activationWindow, 120)}`);
      }

      if (plan.resolveWindow?.trim()) {
        lines.push(`回收窗口：${truncateText(plan.resolveWindow, 120)}`);
      }

      if (typeof plan.plannedActivateVolume === 'number' && plan.plannedActivateVolume > 0) {
        lines.push(`计划激活：第${plan.plannedActivateVolume}卷`);
      }

      if (typeof plan.plannedResolveVolume === 'number' && plan.plannedResolveVolume > 0) {
        lines.push(`计划回收：第${plan.plannedResolveVolume}卷`);
      }

      if (plan.activationCondition) {
        lines.push(`激活条件：${truncateText(plan.activationCondition, 120)}`);
      }

      if (plan.resolveCondition) {
        lines.push(`回收条件：${truncateText(plan.resolveCondition, 120)}`);
      }

      if (plan.payoffEffect) {
        lines.push(`回收效果：${truncateText(plan.payoffEffect, 120)}`);
      }

      return lines.join('\n');
    }),
  ].join('\n\n');
}
