import type { ResourceContinuityRiskLevel } from '@/types';

export interface ResourceContinuityTypeOption {
  value: string;
  label: string;
  scope: 'core' | 'expanded';
}

export const RESOURCE_CONTINUITY_TYPE_OPTIONS: ResourceContinuityTypeOption[] = [
  { value: '伤势', label: '伤势', scope: 'core' },
  { value: '寿命', label: '寿命', scope: 'core' },
  { value: '权限', label: '权限', scope: 'core' },
  { value: '法理反噬', label: '法理反噬', scope: 'core' },
  { value: '物资', label: '物资', scope: 'expanded' },
  { value: '人情', label: '人情', scope: 'expanded' },
  { value: '信用', label: '信用', scope: 'expanded' },
  { value: '证据链', label: '证据链', scope: 'expanded' },
];

export const RESOURCE_CONTINUITY_RISK_LABELS: Record<ResourceContinuityRiskLevel, string> = {
  critical: '致命',
  high: '高',
  medium: '中',
  low: '低',
};
