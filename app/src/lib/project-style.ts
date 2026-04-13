import type { AppSettings, Project } from '@/types';

export function getProjectStylePrompt(
  project: Pick<Project, 'stylePrompt'> | null | undefined,
  settings?: Pick<AppSettings, 'stylePrompt'>,
) {
  return project?.stylePrompt?.trim() || settings?.stylePrompt?.trim() || '';
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
