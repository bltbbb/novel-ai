import { formatPromptSection, mergePromptSections } from '@/lib/project-template';
import type { AppSettings, Project } from '@/types';

export function getProjectStylePrompt(
  project: Pick<Project, 'stylePrompt'> | null | undefined,
  settings?: Pick<AppSettings, 'stylePrompt'>,
) {
  return project?.stylePrompt?.trim() || settings?.stylePrompt?.trim() || '';
}

export function buildEffectiveStylePrompt(
  project: Pick<Project, 'stylePrompt' | 'templateSnapshot'> | null | undefined,
  settings?: Pick<AppSettings, 'stylePrompt'>,
) {
  return mergePromptSections(
    formatPromptSection('创作模板文风约束', project?.templateSnapshot?.promptBundle.stylePrompt),
    formatPromptSection('项目文风', getProjectStylePrompt(project, settings)),
  );
}

export function withProjectStylePrompt(
  settings: AppSettings,
  project: Pick<Project, 'stylePrompt'> | null | undefined,
): AppSettings {
  return {
    ...settings,
    stylePrompt: getProjectStylePrompt(project, settings),
  };
}
