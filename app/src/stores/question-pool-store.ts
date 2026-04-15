import { create } from 'zustand';
import { createId, createTimestamp } from '@/lib/identity';
import {
  clearStructureMemoryMirrorEntity,
  loadStructureMemoryMirror,
  markStructureMemoryMirrorDeleteError,
  markStructureMemoryMirrorPendingDelete,
  markStructureMemoryMirrorPendingUpsert,
  markStructureMemoryMirrorUpsertError,
  syncStructureMemoryMirrorFromServer,
  upsertStructureMemoryMirrorSyncedEntity,
} from '@/lib/structure-memory-mirror';
import {
  createQuestionPool as createQuestionPoolRequest,
  deleteQuestionPool as deleteQuestionPoolRequest,
  fetchQuestionPools,
  type FetchQuestionPoolsOptions,
  type QuestionPoolMutationInput,
  updateQuestionPool as updateQuestionPoolRequest,
} from '@/lib/structure-memory-client';
import { useSettingsStore } from '@/stores/settings-store';
import type { Id, QuestionPool, QuestionPoolAlert, StructureMemorySyncStatus } from '@/types';

const MIRROR_SYSTEM = 'question_pool';

interface QuestionPoolStoreState {
  questionPools: QuestionPool[];
  alerts: QuestionPoolAlert[];
  syncStatusById: Record<Id, StructureMemorySyncStatus>;
  localOnlyById: Record<Id, boolean>;
  activeQuestionPoolId: Id | null;
  loadedProjectId: Id | null;
  isLoaded: boolean;
  loadQuestionPools: (projectId: Id, options?: FetchQuestionPoolsOptions) => Promise<void>;
  setActiveQuestionPool: (questionPoolId: Id | null) => void;
  createQuestionPool: (input: QuestionPoolMutationInput, options?: FetchQuestionPoolsOptions) => Promise<QuestionPool>;
  updateQuestionPool: (
    questionPoolId: Id,
    input: QuestionPoolMutationInput,
    options?: FetchQuestionPoolsOptions,
  ) => Promise<QuestionPool>;
  deleteQuestionPool: (projectId: Id, questionPoolId: Id, options?: FetchQuestionPoolsOptions) => Promise<void>;
}

function getServerUrl() {
  return useSettingsStore.getState().settings.serverUrl;
}

export const useQuestionPoolStore = create<QuestionPoolStoreState>((set, get) => ({
  questionPools: [],
  alerts: [],
  syncStatusById: {},
  localOnlyById: {},
  activeQuestionPoolId: null,
  loadedProjectId: null,
  isLoaded: false,

  async loadQuestionPools(projectId, options) {
    const cached = await loadStructureMemoryMirror<QuestionPool>(projectId, MIRROR_SYSTEM);

    if (cached.hasMirror) {
      set((state) => ({
        questionPools: cached.items,
        alerts: [],
        syncStatusById: cached.syncStatusById,
        localOnlyById: cached.localOnlyById,
        activeQuestionPoolId:
          state.loadedProjectId === projectId && cached.items.some((item) => item.id === state.activeQuestionPoolId)
            ? state.activeQuestionPoolId
            : cached.items[0]?.id ?? null,
        loadedProjectId: projectId,
        isLoaded: true,
      }));
    }

    try {
      const result = await fetchQuestionPools(getServerUrl(), projectId, options);
      const mirrored = await syncStructureMemoryMirrorFromServer(projectId, MIRROR_SYSTEM, result.items);

      set((state) => ({
        questionPools: mirrored.items,
        alerts: result.alerts,
        syncStatusById: mirrored.syncStatusById,
        localOnlyById: mirrored.localOnlyById,
        activeQuestionPoolId:
          state.loadedProjectId === projectId && mirrored.items.some((item) => item.id === state.activeQuestionPoolId)
            ? state.activeQuestionPoolId
            : mirrored.items[0]?.id ?? null,
        loadedProjectId: projectId,
        isLoaded: true,
      }));
    } catch (error) {
      if (!cached.hasMirror) {
        throw error;
      }
    }
  },

  setActiveQuestionPool(questionPoolId) {
    set({
      activeQuestionPoolId: questionPoolId,
    });
  },

  async createQuestionPool(input, options) {
    try {
      const item = await createQuestionPoolRequest(getServerUrl(), input);
      await upsertStructureMemoryMirrorSyncedEntity(MIRROR_SYSTEM, item);
      await get().loadQuestionPools(item.projectId, options);
      set({
        activeQuestionPoolId: item.id,
      });
      return item;
    } catch (error) {
      const localItem: QuestionPool = {
        id: createId(),
        projectId: input.projectId,
        question: input.question?.trim() || '未命名问题',
        firstRaisedChapterId: input.firstRaisedChapterId ?? null,
        firstRaisedAt: input.firstRaisedAt?.trim() || '',
        belongsToThreadId: input.belongsToThreadId ?? null,
        belongsToThreadName: input.belongsToThreadName?.trim() || '',
        currentClue: input.currentClue?.trim() || '',
        falseAnswers: [...(input.falseAnswers ?? [])],
        expectedRevealWindow: input.expectedRevealWindow?.trim() || '',
        finalAnswerSummary: input.finalAnswerSummary?.trim() || '',
        status: input.status ?? 'open',
        createdAt: createTimestamp(),
        updatedAt: createTimestamp(),
      };

      await markStructureMemoryMirrorPendingUpsert(MIRROR_SYSTEM, localItem);
      await markStructureMemoryMirrorUpsertError(
        MIRROR_SYSTEM,
        localItem,
        error instanceof Error ? error.message : '未解问题创建同步失败',
      );

      set((state) => ({
        questionPools: [localItem, ...state.questionPools.filter((item) => item.id !== localItem.id)],
        syncStatusById: {
          ...state.syncStatusById,
          [localItem.id]: 'sync_error',
        },
        localOnlyById: {
          ...state.localOnlyById,
          [localItem.id]: true,
        },
        activeQuestionPoolId: localItem.id,
        loadedProjectId: input.projectId,
        isLoaded: true,
      }));

      return localItem;
    }
  },

  async updateQuestionPool(questionPoolId, input, options) {
    const current = get().questionPools.find((item) => item.id === questionPoolId) ?? null;
    const isLocalOnly = get().localOnlyById[questionPoolId] === true;
    const optimisticItem = current
      ? ({
          ...current,
          ...input,
          id: current.id,
          projectId: current.projectId,
          updatedAt: createTimestamp(),
        } satisfies QuestionPool)
      : null;

    if (optimisticItem) {
      await markStructureMemoryMirrorPendingUpsert(MIRROR_SYSTEM, optimisticItem);
      set((state) => ({
        questionPools: state.questionPools.map((item) => (item.id === questionPoolId ? optimisticItem : item)),
        syncStatusById: {
          ...state.syncStatusById,
          [questionPoolId]: 'pending_push',
        },
      }));
    }

    try {
      const item = isLocalOnly
        ? await createQuestionPoolRequest(getServerUrl(), input)
        : await updateQuestionPoolRequest(getServerUrl(), questionPoolId, input);
      if (isLocalOnly) {
        await clearStructureMemoryMirrorEntity(MIRROR_SYSTEM, questionPoolId);
      }
      await upsertStructureMemoryMirrorSyncedEntity(MIRROR_SYSTEM, item);
      await get().loadQuestionPools(item.projectId, options);
      set({
        activeQuestionPoolId: item.id,
      });
      return item;
    } catch (error) {
      if (optimisticItem) {
        await markStructureMemoryMirrorUpsertError(
          MIRROR_SYSTEM,
          optimisticItem,
          error instanceof Error ? error.message : '未解问题同步失败',
        );
        set((state) => ({
          syncStatusById: {
            ...state.syncStatusById,
            [questionPoolId]: 'sync_error',
          },
          localOnlyById: {
            ...state.localOnlyById,
            [questionPoolId]: isLocalOnly,
          },
        }));
      }
      throw error;
    }
  },

  async deleteQuestionPool(projectId, questionPoolId, options) {
    if (get().localOnlyById[questionPoolId]) {
      await clearStructureMemoryMirrorEntity(MIRROR_SYSTEM, questionPoolId);
      set((state) => {
        const nextItems = state.questionPools.filter((item) => item.id !== questionPoolId);
        const nextSyncStatusById = { ...state.syncStatusById };
        const nextLocalOnlyById = { ...state.localOnlyById };
        delete nextSyncStatusById[questionPoolId];
        delete nextLocalOnlyById[questionPoolId];

        return {
          questionPools: nextItems,
          syncStatusById: nextSyncStatusById,
          localOnlyById: nextLocalOnlyById,
          activeQuestionPoolId:
            state.activeQuestionPoolId === questionPoolId ? nextItems[0]?.id ?? null : state.activeQuestionPoolId,
        };
      });
      return;
    }

    await markStructureMemoryMirrorPendingDelete(projectId, MIRROR_SYSTEM, questionPoolId);
    set((state) => ({
      syncStatusById: {
        ...state.syncStatusById,
        [questionPoolId]: 'pending_push',
      },
      localOnlyById: {
        ...state.localOnlyById,
        [questionPoolId]: false,
      },
    }));

    try {
      await deleteQuestionPoolRequest(getServerUrl(), projectId, questionPoolId);
      await clearStructureMemoryMirrorEntity(MIRROR_SYSTEM, questionPoolId);
      await get().loadQuestionPools(projectId, options);
    } catch (error) {
      await markStructureMemoryMirrorDeleteError(
        projectId,
        MIRROR_SYSTEM,
        questionPoolId,
        error instanceof Error ? error.message : '未解问题删除同步失败',
      );
      set((state) => ({
        syncStatusById: {
          ...state.syncStatusById,
          [questionPoolId]: 'sync_error',
        },
        localOnlyById: {
          ...state.localOnlyById,
          [questionPoolId]: false,
        },
      }));
      throw error;
    }
  },
}));
