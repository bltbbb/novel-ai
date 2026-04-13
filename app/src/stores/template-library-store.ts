import { create } from 'zustand';
import { db } from '@/lib/db';
import { createId, createTimestamp } from '@/lib/identity';
import { cloneTemplateLibraryDraft, normalizeTemplateLibraryDraft } from '@/lib/project-template';
import type { Id, TemplateLibraryDraft, TemplateLibraryItem } from '@/types';

interface TemplateLibraryStoreState {
  templates: TemplateLibraryItem[];
  isLoaded: boolean;
  loadTemplates: () => Promise<void>;
  createTemplate: (draft: TemplateLibraryDraft) => Promise<TemplateLibraryItem>;
  updateTemplate: (templateId: Id, draft: TemplateLibraryDraft) => Promise<TemplateLibraryItem | null>;
  deleteTemplate: (templateId: Id) => Promise<void>;
}

function sortTemplates(templates: TemplateLibraryItem[]) {
  return [...templates].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export const useTemplateLibraryStore = create<TemplateLibraryStoreState>((set, get) => ({
  templates: [],
  isLoaded: false,

  async loadTemplates() {
    const templates = await db.templateLibrary.orderBy('updatedAt').reverse().toArray();
    set({
      templates,
      isLoaded: true,
    });
  },

  async createTemplate(draft) {
    const now = createTimestamp();
    const normalized = normalizeTemplateLibraryDraft(cloneTemplateLibraryDraft(draft));
    const template: TemplateLibraryItem = {
      ...normalized,
      id: createId(),
      createdAt: now,
      updatedAt: now,
    };

    await db.templateLibrary.put(template);

    set((state) => ({
      templates: sortTemplates([template, ...state.templates]),
      isLoaded: true,
    }));

    return template;
  },

  async updateTemplate(templateId, draft) {
    const current =
      get().templates.find((item) => item.id === templateId) ?? (await db.templateLibrary.get(templateId));

    if (!current) {
      return null;
    }

    const normalized = normalizeTemplateLibraryDraft(cloneTemplateLibraryDraft(draft));
    const nextTemplate: TemplateLibraryItem = {
      ...current,
      ...normalized,
      updatedAt: createTimestamp(),
    };

    await db.templateLibrary.put(nextTemplate);

    set((state) => ({
      templates: sortTemplates(
        state.templates.map((item) => (item.id === templateId ? nextTemplate : item)),
      ),
      isLoaded: true,
    }));

    return nextTemplate;
  },

  async deleteTemplate(templateId) {
    await db.templateLibrary.delete(templateId);

    set((state) => ({
      templates: state.templates.filter((item) => item.id !== templateId),
      isLoaded: true,
    }));
  },
}));

