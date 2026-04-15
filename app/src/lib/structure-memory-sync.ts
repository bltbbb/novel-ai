import type { StructureMemorySyncStatus } from '@/types';

export function getStructureMemorySyncLabel(
  syncStatus: StructureMemorySyncStatus | undefined,
  localOnly: boolean,
) {
  if (localOnly) {
    return '本地草稿';
  }

  if (syncStatus === 'pending_push') {
    return '待同步';
  }

  if (syncStatus === 'sync_error') {
    return '同步失败';
  }

  return '已同步';
}

export function getStructureMemorySyncBadgeClassName(
  syncStatus: StructureMemorySyncStatus | undefined,
  localOnly: boolean,
  active: boolean,
) {
  if (localOnly || syncStatus === 'sync_error') {
    return active
      ? 'border-amber-400/50 bg-amber-500/20 text-amber-100'
      : 'border-amber-500/20 bg-amber-500/10 text-amber-200';
  }

  if (syncStatus === 'pending_push') {
    return active
      ? 'border-sky-400/50 bg-sky-500/20 text-sky-100'
      : 'border-sky-500/20 bg-sky-500/10 text-sky-200';
  }

  return active
    ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
    : 'border-emerald-500/10 bg-emerald-500/5 text-emerald-200';
}

export function buildStructureMemorySaveFeedback(input: {
  syncStatus: StructureMemorySyncStatus | undefined;
  localOnly: boolean;
  syncedMessage: string;
  entityLabel: string;
}) {
  if (input.syncStatus === 'synced' || typeof input.syncStatus === 'undefined') {
    return {
      tone: 'success' as const,
      message: input.syncedMessage,
    };
  }

  if (input.localOnly) {
    return {
      tone: 'warning' as const,
      message: `${input.entityLabel}已保存在本地草稿，待网络恢复后可继续同步。`,
    };
  }

  return {
    tone: 'warning' as const,
    message: `${input.entityLabel}已保留本地改动，待稍后重试同步。`,
  };
}
