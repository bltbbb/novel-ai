import { create } from 'zustand';
import { db, touchProject } from '@/lib/db';
import { createId, createTimestamp } from '@/lib/identity';
import { useProjectStore } from '@/stores/project-store';
import type { IdeaCard, IdeaCardSource, Id } from '@/types';

interface CreateIdeaCardInput {
  projectId: Id;
  sourceChapterId?: Id | null;
  title?: string;
  content: string;
  source?: IdeaCardSource;
}

interface IdeaCardStoreState {
  ideaCards: IdeaCard[];
  loadedProjectId: Id | null;
  isLoaded: boolean;
  loadIdeaCards: (projectId: Id) => Promise<void>;
  createIdeaCard: (input: CreateIdeaCardInput) => Promise<IdeaCard>;
  deleteIdeaCard: (ideaCardId: Id) => Promise<void>;
}

function sortIdeaCards(ideaCards: IdeaCard[]) {
  return [...ideaCards].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function normalizeText(value: string | undefined, fallback: string) {
  const normalized = value?.trim();
  return normalized ? normalized : fallback;
}

export const useIdeaCardStore = create<IdeaCardStoreState>((set, get) => ({
  ideaCards: [],
  loadedProjectId: null,
  isLoaded: false,

  async loadIdeaCards(projectId) {
    const ideaCards = sortIdeaCards(await db.ideaCards.where('projectId').equals(projectId).toArray());

    set({
      ideaCards,
      loadedProjectId: projectId,
      isLoaded: true,
    });
  },

  async createIdeaCard(input) {
    const now = createTimestamp();
    const content = input.content.trim();
    const ideaCard: IdeaCard = {
      id: createId(),
      projectId: input.projectId,
      sourceChapterId: input.sourceChapterId ?? null,
      title: normalizeText(input.title, '未命名灵感'),
      content,
      source: input.source ?? 'manual',
      createdAt: now,
      updatedAt: now,
    };

    await db.ideaCards.put(ideaCard);
    await touchProject(input.projectId);
    await useProjectStore.getState().loadProjects();

    const nextIdeaCards =
      get().loadedProjectId === input.projectId
        ? sortIdeaCards([ideaCard, ...get().ideaCards])
        : [ideaCard];

    set({
      ideaCards: nextIdeaCards,
      loadedProjectId: input.projectId,
      isLoaded: true,
    });

    return ideaCard;
  },

  async deleteIdeaCard(ideaCardId) {
    const current =
      get().ideaCards.find((item) => item.id === ideaCardId) ?? (await db.ideaCards.get(ideaCardId));

    if (!current) {
      return;
    }

    await db.ideaCards.delete(ideaCardId);
    await touchProject(current.projectId);
    await useProjectStore.getState().loadProjects();

    set((state) => ({
      ideaCards: state.ideaCards.filter((item) => item.id !== ideaCardId),
    }));
  },
}));
