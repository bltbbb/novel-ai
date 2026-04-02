import { create } from 'zustand';
import { createParagraphDocument, countDocumentCharacters } from '@/lib/editor-content';
import { db, recalculateProjectWordCount, touchProject } from '@/lib/db';
import { createId, createTimestamp } from '@/lib/identity';
import { useProjectStore } from '@/stores/project-store';
import type { Chapter, Id, RichTextDocument } from '@/types';

interface CreateChapterInput {
  projectId: Id;
  title?: string;
  volumeTitle?: string;
}

interface EditorStoreState {
  chapters: Chapter[];
  activeChapterId: Id | null;
  loadedProjectId: Id | null;
  isLoaded: boolean;
  isDirty: boolean;
  lastSavedAt: string | null;
  loadChapters: (projectId: Id) => Promise<void>;
  setActiveChapter: (chapterId: Id | null) => void;
  createChapter: (input: CreateChapterInput) => Promise<Chapter>;
  updateChapterTitle: (chapterId: Id, title: string) => Promise<void>;
  saveChapterContent: (chapterId: Id, content: RichTextDocument) => Promise<void>;
  deleteChapter: (chapterId: Id) => Promise<void>;
  markDirty: () => void;
  clearDirty: () => void;
}

function sortChapters(chapters: Chapter[]) {
  return [...chapters].sort((a, b) => a.order - b.order);
}

export const useEditorStore = create<EditorStoreState>((set, get) => ({
  chapters: [],
  activeChapterId: null,
  loadedProjectId: null,
  isLoaded: false,
  isDirty: false,
  lastSavedAt: null,

  async loadChapters(projectId) {
    const chapters = await db.chapters.where('projectId').equals(projectId).sortBy('order');

    set((state) => ({
      chapters,
      loadedProjectId: projectId,
      activeChapterId:
        state.loadedProjectId === projectId && chapters.some((chapter) => chapter.id === state.activeChapterId)
          ? state.activeChapterId
          : chapters[0]?.id ?? null,
      isLoaded: true,
      isDirty: false,
    }));
  },

  setActiveChapter(chapterId) {
    set({ activeChapterId: chapterId });
  },

  async createChapter(input) {
    const existingChapters =
      get().loadedProjectId === input.projectId
        ? get().chapters
        : await db.chapters.where('projectId').equals(input.projectId).sortBy('order');
    const maxOrder = existingChapters.reduce((currentMax, chapter) => Math.max(currentMax, chapter.order), 0);
    const now = createTimestamp();

    const chapter: Chapter = {
      id: createId(),
      projectId: input.projectId,
      volumeTitle: input.volumeTitle,
      title: input.title?.trim() || `第${maxOrder + 1}章`,
      order: maxOrder + 1,
      content: createParagraphDocument(),
      wordCount: 0,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    };

    await db.chapters.put(chapter);
    await touchProject(input.projectId);
    await useProjectStore.getState().loadProjects();

    const nextChapters =
      get().loadedProjectId === input.projectId ? sortChapters([...get().chapters, chapter]) : [chapter];

    set({
      chapters: nextChapters,
      activeChapterId: chapter.id,
      loadedProjectId: input.projectId,
      isLoaded: true,
      isDirty: false,
      lastSavedAt: now,
    });

    return chapter;
  },

  async updateChapterTitle(chapterId, title) {
    const current = get().chapters.find((chapter) => chapter.id === chapterId) ?? (await db.chapters.get(chapterId));

    if (!current) {
      return;
    }

    const nextChapter: Chapter = {
      ...current,
      title: title.trim() || current.title,
      updatedAt: createTimestamp(),
    };

    await db.chapters.put(nextChapter);
    await touchProject(nextChapter.projectId);
    await useProjectStore.getState().loadProjects();

    set((state) => ({
      chapters: sortChapters(
        state.chapters.map((chapter) => (chapter.id === chapterId ? nextChapter : chapter)),
      ),
      lastSavedAt: nextChapter.updatedAt,
      isDirty: false,
    }));
  },

  async saveChapterContent(chapterId, content) {
    const current = get().chapters.find((chapter) => chapter.id === chapterId) ?? (await db.chapters.get(chapterId));

    if (!current) {
      return;
    }

    const nextChapter: Chapter = {
      ...current,
      content,
      wordCount: countDocumentCharacters(content),
      updatedAt: createTimestamp(),
    };

    await db.chapters.put(nextChapter);
    await recalculateProjectWordCount(nextChapter.projectId);
    await useProjectStore.getState().loadProjects();

    set((state) => ({
      chapters: sortChapters(
        state.chapters.map((chapter) => (chapter.id === chapterId ? nextChapter : chapter)),
      ),
      lastSavedAt: nextChapter.updatedAt,
      isDirty: false,
    }));
  },

  async deleteChapter(chapterId) {
    const target = get().chapters.find((chapter) => chapter.id === chapterId) ?? (await db.chapters.get(chapterId));

    if (!target) {
      return;
    }

    await db.chapters.delete(chapterId);
    await db.snapshots.where('chapterId').equals(chapterId).delete();
    await db.chapterOutlines.where('chapterId').equals(chapterId).delete();
    await db.chapterSummaries.where('chapterId').equals(chapterId).delete();
    await db.stateChanges.where('chapterId').equals(chapterId).delete();
    await db.generationQueue.where('chapterId').equals(chapterId).delete();
    await recalculateProjectWordCount(target.projectId);
    await useProjectStore.getState().loadProjects();

    set((state) => {
      const chapters = state.chapters.filter((chapter) => chapter.id !== chapterId);

      return {
        chapters,
        activeChapterId:
          state.activeChapterId === chapterId ? chapters[0]?.id ?? null : state.activeChapterId,
        isDirty: false,
      };
    });
  },

  markDirty() {
    set({ isDirty: true });
  },

  clearDirty() {
    set({ isDirty: false });
  },
}));
