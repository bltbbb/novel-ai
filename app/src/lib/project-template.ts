import { createTimestamp } from '@/lib/identity';
import type {
  ProjectTemplateSnapshot,
  TemplateLibraryDraft,
  TemplateLibraryItem,
  TemplatePromptBundle,
  TemplateSubPromptBundle,
  TemplateSubTemplateDraft,
  TemplateSubTemplates,
} from '@/types';

export const EMPTY_TEMPLATE_PROMPT_BUNDLE: TemplatePromptBundle = {
  bookOutlinePrompt: '',
  volumeOutlinePrompt: '',
  milestonePrompt: '',
  beatPrompt: '',
  writingPrompt: '',
  stylePrompt: '',
  negativePrompt: '',
};

export const EMPTY_TEMPLATE_SUB_PROMPT_BUNDLE: TemplateSubPromptBundle = {
  beatPrompt: '',
  writingPrompt: '',
  stylePrompt: '',
  negativePrompt: '',
};

export const EMPTY_TEMPLATE_SUB_TEMPLATE: TemplateSubTemplateDraft = {
  summary: '',
  usage: '',
  promptBundle: { ...EMPTY_TEMPLATE_SUB_PROMPT_BUNDLE },
};

export const EMPTY_TEMPLATE_SUB_TEMPLATES: TemplateSubTemplates = {
  opening: {
    ...EMPTY_TEMPLATE_SUB_TEMPLATE,
    promptBundle: { ...EMPTY_TEMPLATE_SUB_PROMPT_BUNDLE },
  },
  middle: {
    ...EMPTY_TEMPLATE_SUB_TEMPLATE,
    promptBundle: { ...EMPTY_TEMPLATE_SUB_PROMPT_BUNDLE },
  },
  climax: {
    ...EMPTY_TEMPLATE_SUB_TEMPLATE,
    promptBundle: { ...EMPTY_TEMPLATE_SUB_PROMPT_BUNDLE },
  },
  ending: {
    ...EMPTY_TEMPLATE_SUB_TEMPLATE,
    promptBundle: { ...EMPTY_TEMPLATE_SUB_PROMPT_BUNDLE },
  },
};

export const EMPTY_TEMPLATE_LIBRARY_DRAFT: TemplateLibraryDraft = {
  name: '',
  sourceTitle: '',
  sourceAuthor: '',
  tags: [],
  summary: '',
  narrativeStyle: '',
  pacingStyle: '',
  conflictStyle: '',
  characterStyle: '',
  dialogueStyle: '',
  openingStyle: '',
  endingHookStyle: '',
  commonPatterns: [],
  forbiddenPatterns: [],
  promptBundle: { ...EMPTY_TEMPLATE_PROMPT_BUNDLE },
  subTemplates: {
    opening: {
      ...EMPTY_TEMPLATE_SUB_TEMPLATE,
      promptBundle: { ...EMPTY_TEMPLATE_SUB_PROMPT_BUNDLE },
    },
    middle: {
      ...EMPTY_TEMPLATE_SUB_TEMPLATE,
      promptBundle: { ...EMPTY_TEMPLATE_SUB_PROMPT_BUNDLE },
    },
    climax: {
      ...EMPTY_TEMPLATE_SUB_TEMPLATE,
      promptBundle: { ...EMPTY_TEMPLATE_SUB_PROMPT_BUNDLE },
    },
    ending: {
      ...EMPTY_TEMPLATE_SUB_TEMPLATE,
      promptBundle: { ...EMPTY_TEMPLATE_SUB_PROMPT_BUNDLE },
    },
  },
  analysisMeta: null,
};

export function cloneTemplatePromptBundle(bundle?: Partial<TemplatePromptBundle> | null): TemplatePromptBundle {
  return {
    ...EMPTY_TEMPLATE_PROMPT_BUNDLE,
    ...bundle,
  };
}

export function cloneTemplateSubPromptBundle(
  bundle?: Partial<TemplateSubPromptBundle> | null,
): TemplateSubPromptBundle {
  return {
    ...EMPTY_TEMPLATE_SUB_PROMPT_BUNDLE,
    ...bundle,
  };
}

export function cloneTemplateSubTemplate(
  draft?: Partial<TemplateSubTemplateDraft> | null,
): TemplateSubTemplateDraft {
  return {
    ...EMPTY_TEMPLATE_SUB_TEMPLATE,
    ...draft,
    promptBundle: cloneTemplateSubPromptBundle(draft?.promptBundle),
  };
}

export function cloneTemplateSubTemplates(
  drafts?: Partial<TemplateSubTemplates> | null,
): TemplateSubTemplates {
  return {
    opening: cloneTemplateSubTemplate(drafts?.opening),
    middle: cloneTemplateSubTemplate(drafts?.middle),
    climax: cloneTemplateSubTemplate(drafts?.climax),
    ending: cloneTemplateSubTemplate(drafts?.ending),
  };
}

export function cloneTemplateLibraryDraft(
  draft?: Partial<TemplateLibraryDraft> | null,
): TemplateLibraryDraft {
  return {
    ...EMPTY_TEMPLATE_LIBRARY_DRAFT,
    ...draft,
    tags: [...(draft?.tags ?? EMPTY_TEMPLATE_LIBRARY_DRAFT.tags)],
    commonPatterns: [...(draft?.commonPatterns ?? EMPTY_TEMPLATE_LIBRARY_DRAFT.commonPatterns)],
    forbiddenPatterns: [...(draft?.forbiddenPatterns ?? EMPTY_TEMPLATE_LIBRARY_DRAFT.forbiddenPatterns)],
    promptBundle: cloneTemplatePromptBundle(draft?.promptBundle),
    subTemplates: cloneTemplateSubTemplates(draft?.subTemplates),
    analysisMeta: draft?.analysisMeta ?? null,
  };
}

export function splitTemplateTextList(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function splitTemplateTags(value: string) {
  return value
    .split(/[，,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function joinTemplateList(values: string[]) {
  return values.join('\n');
}

export function joinTemplateTags(values: string[]) {
  return values.join('，');
}

export function normalizeTemplateLibraryDraft(
  draft: TemplateLibraryDraft,
): TemplateLibraryDraft {
  const promptBundle = cloneTemplatePromptBundle(draft.promptBundle);
  const subTemplates = cloneTemplateSubTemplates(draft.subTemplates);

  return {
    ...draft,
    name: draft.name.trim(),
    sourceTitle: draft.sourceTitle.trim(),
    sourceAuthor: draft.sourceAuthor.trim(),
    tags: draft.tags.map((item) => item.trim()).filter(Boolean),
    summary: draft.summary.trim(),
    narrativeStyle: draft.narrativeStyle.trim(),
    pacingStyle: draft.pacingStyle.trim(),
    conflictStyle: draft.conflictStyle.trim(),
    characterStyle: draft.characterStyle.trim(),
    dialogueStyle: draft.dialogueStyle.trim(),
    openingStyle: draft.openingStyle.trim(),
    endingHookStyle: draft.endingHookStyle.trim(),
    commonPatterns: draft.commonPatterns.map((item) => item.trim()).filter(Boolean),
    forbiddenPatterns: draft.forbiddenPatterns.map((item) => item.trim()).filter(Boolean),
    promptBundle: {
      bookOutlinePrompt: promptBundle.bookOutlinePrompt.trim(),
      volumeOutlinePrompt: promptBundle.volumeOutlinePrompt.trim(),
      milestonePrompt: promptBundle.milestonePrompt.trim(),
      beatPrompt: promptBundle.beatPrompt.trim(),
      writingPrompt: promptBundle.writingPrompt.trim(),
      stylePrompt: promptBundle.stylePrompt.trim(),
      negativePrompt: promptBundle.negativePrompt.trim(),
    },
    subTemplates: {
      opening: {
        summary: subTemplates.opening.summary.trim(),
        usage: subTemplates.opening.usage.trim(),
        promptBundle: {
          beatPrompt: subTemplates.opening.promptBundle.beatPrompt.trim(),
          writingPrompt: subTemplates.opening.promptBundle.writingPrompt.trim(),
          stylePrompt: subTemplates.opening.promptBundle.stylePrompt.trim(),
          negativePrompt: subTemplates.opening.promptBundle.negativePrompt.trim(),
        },
      },
      middle: {
        summary: subTemplates.middle.summary.trim(),
        usage: subTemplates.middle.usage.trim(),
        promptBundle: {
          beatPrompt: subTemplates.middle.promptBundle.beatPrompt.trim(),
          writingPrompt: subTemplates.middle.promptBundle.writingPrompt.trim(),
          stylePrompt: subTemplates.middle.promptBundle.stylePrompt.trim(),
          negativePrompt: subTemplates.middle.promptBundle.negativePrompt.trim(),
        },
      },
      climax: {
        summary: subTemplates.climax.summary.trim(),
        usage: subTemplates.climax.usage.trim(),
        promptBundle: {
          beatPrompt: subTemplates.climax.promptBundle.beatPrompt.trim(),
          writingPrompt: subTemplates.climax.promptBundle.writingPrompt.trim(),
          stylePrompt: subTemplates.climax.promptBundle.stylePrompt.trim(),
          negativePrompt: subTemplates.climax.promptBundle.negativePrompt.trim(),
        },
      },
      ending: {
        summary: subTemplates.ending.summary.trim(),
        usage: subTemplates.ending.usage.trim(),
        promptBundle: {
          beatPrompt: subTemplates.ending.promptBundle.beatPrompt.trim(),
          writingPrompt: subTemplates.ending.promptBundle.writingPrompt.trim(),
          stylePrompt: subTemplates.ending.promptBundle.stylePrompt.trim(),
          negativePrompt: subTemplates.ending.promptBundle.negativePrompt.trim(),
        },
      },
    },
    analysisMeta: draft.analysisMeta ?? null,
  };
}

export function buildProjectTemplateSnapshot(template: TemplateLibraryItem): ProjectTemplateSnapshot {
  return {
    templateId: template.id,
    templateName: template.name,
    sourceTitle: template.sourceTitle,
    sourceAuthor: template.sourceAuthor,
    summary: template.summary,
    tags: [...template.tags],
    promptBundle: cloneTemplatePromptBundle(template.promptBundle),
    subTemplates: cloneTemplateSubTemplates(template.subTemplates),
    boundAt: createTimestamp(),
  };
}

export function formatPromptSection(title: string, content?: string) {
  const normalized = content?.trim() ?? '';
  if (!normalized) {
    return '';
  }

  return `【${title}】\n${normalized}`;
}

export function mergePromptSections(...sections: Array<string | null | undefined>) {
  return sections
    .map((section) => section?.trim() ?? '')
    .filter(Boolean)
    .join('\n\n');
}
