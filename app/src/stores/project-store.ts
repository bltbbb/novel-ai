import type { Table } from 'dexie';
import { create } from 'zustand';
import { countDocumentCharacters, createParagraphDocument } from '@/lib/editor-content';
import { DEFAULT_GENERATION_GATE_CONFIG, normalizeLightweightRecallConfig } from '@/lib/generation-gate-defaults';
import { db, DEFAULT_VOLUME_TITLE, deleteProjectCascade } from '@/lib/db';
import { createId, createTimestamp } from '@/lib/identity';
import { buildProjectArchive, importProjectArchive as importArchiveToDb } from '@/lib/project-archive';
import { cloneTemplateSubTemplates } from '@/lib/project-template';
import type {
  Chapter,
  Id,
  LoreEntity,
  LoreEntityFields,
  LoreEntityType,
  Project,
  ProjectArchive,
  ProjectGenerationGateOverride,
  ProjectTemplateSnapshot,
  Volume,
} from '@/types';

interface CreateProjectInput {
  title?: string;
  description?: string;
  genre?: string[];
  stylePrompt?: string;
  templateSnapshot?: ProjectTemplateSnapshot | null;
  seedChapters?: Array<{
    title: string;
    content?: string;
  }>;
  seedEntities?: Array<{
    type: LoreEntityType;
    name: string;
    description?: string;
    fields?: LoreEntityFields;
    tags?: string[];
    pinned?: boolean;
  }>;
}

interface CreateProjectOptions {
  activate?: boolean;
}

interface UpdateProjectInput {
  title?: string;
  description?: string;
  genre?: string[];
  stylePrompt?: string;
  templateSnapshot?: ProjectTemplateSnapshot | null;
  generationGateOverride?: ProjectGenerationGateOverride | null;
}

interface ProjectStoreState {
  projects: Project[];
  activeProjectId: Id | null;
  isLoaded: boolean;
  loadProjects: () => Promise<void>;
  createProject: (input?: CreateProjectInput, options?: CreateProjectOptions) => Promise<Project>;
  updateProject: (projectId: Id, input: UpdateProjectInput) => Promise<void>;
  deleteProject: (projectId: Id) => Promise<void>;
  exportProjectArchive: (projectId: Id) => Promise<ProjectArchive>;
  importProjectArchive: (archive: ProjectArchive) => Promise<Project>;
  setActiveProject: (projectId: Id | null) => void;
}

function sortProjects(projects: Project[]) {
  return [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function normalizeProjectGateOverride(
  value: ProjectGenerationGateOverride | null | undefined,
): ProjectGenerationGateOverride | null {
  if (!value) {
    return null;
  }

  return {
    reviewRewriteMinSeverity: value.reviewRewriteMinSeverity,
    reviewMaxRewriteCount: Math.max(0, Math.trunc(value.reviewMaxRewriteCount)),
    reviewScoreThresholds: {
      consistency: Math.max(0, Math.min(100, Math.trunc(value.reviewScoreThresholds?.consistency ?? DEFAULT_GENERATION_GATE_CONFIG.reviewScoreThresholds.consistency))),
      continuity: Math.max(0, Math.min(100, Math.trunc(value.reviewScoreThresholds?.continuity ?? DEFAULT_GENERATION_GATE_CONFIG.reviewScoreThresholds.continuity))),
      reader_pull: Math.max(0, Math.min(100, Math.trunc(value.reviewScoreThresholds?.reader_pull ?? DEFAULT_GENERATION_GATE_CONFIG.reviewScoreThresholds.reader_pull))),
    },
    polishFailBlockReady: value.polishFailBlockReady,
    lightweightRecall: normalizeLightweightRecallConfig(value.lightweightRecall),
  };
}

function normalizeProjectStylePrompt(stylePrompt: string | null | undefined) {
  return stylePrompt?.trim() || '';
}

function normalizeProject(project: Project): Project {
  return {
    ...project,
    stylePrompt: normalizeProjectStylePrompt(project.stylePrompt),
    templateSnapshot: project.templateSnapshot
      ? {
          ...project.templateSnapshot,
          tags: [...project.templateSnapshot.tags],
          promptBundle: {
            ...project.templateSnapshot.promptBundle,
          },
          subTemplates: cloneTemplateSubTemplates(project.templateSnapshot.subTemplates),
        }
      : null,
    generationGateOverride: normalizeProjectGateOverride(project.generationGateOverride),
  };
}

export const useProjectStore = create<ProjectStoreState>((set, get) => ({
  projects: [],
  activeProjectId: null,
  isLoaded: false,

  async loadProjects() {
    const projects = (await db.projects.orderBy('updatedAt').reverse().toArray()).map(normalizeProject);

    set((state) => ({
      projects,
      activeProjectId: state.activeProjectId ?? projects[0]?.id ?? null,
      isLoaded: true,
    }));
  },

  async createProject(input, options) {
    const now = createTimestamp();
    const projectId = createId();
    const defaultVolume: Volume = {
      id: createId(),
      projectId,
      title: DEFAULT_VOLUME_TITLE,
      order: 1,
      createdAt: now,
      updatedAt: now,
    };
    const chapters: Chapter[] = (input?.seedChapters ?? []).map((seedChapter, index) => {
      const content = createParagraphDocument(seedChapter.content ?? '');

      return {
        id: createId(),
        projectId,
        volumeId: defaultVolume.id,
        volumeTitle: defaultVolume.title,
        title: seedChapter.title.trim() || `第${index + 1}章`,
        order: index + 1,
        content,
        wordCount: countDocumentCharacters(content),
        status: 'draft',
        createdAt: now,
        updatedAt: now,
      };
    });
    const entities: LoreEntity[] = (input?.seedEntities ?? []).map((seedEntity) => ({
      id: createId(),
      projectId,
      type: seedEntity.type,
      name: seedEntity.name.trim() || '未命名设定',
      description: seedEntity.description?.trim() || '',
      fields: seedEntity.fields ?? {},
      tags: seedEntity.tags ?? [],
      pinned: seedEntity.pinned ?? false,
      createdAt: now,
      updatedAt: now,
    }));
    const project: Project = {
      id: projectId,
      title: input?.title?.trim() || '未命名项目',
      description: input?.description?.trim() || '',
      genre: input?.genre ?? [],
      stylePrompt: normalizeProjectStylePrompt(input?.stylePrompt),
      templateSnapshot: input?.templateSnapshot ?? null,
      generationGateOverride: null,
      wordCount: chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0),
      createdAt: now,
      updatedAt: now,
    };

    const tables: Table<any, any>[] = [
      db.projects,
      db.chapters as Table<any, any>,
      db.volumes,
      db.entities,
    ];

    await db.transaction('rw', tables, async () => {
      await db.projects.put(project);
      await db.volumes.put(defaultVolume);

      if (chapters.length > 0) {
        await db.chapters.bulkAdd(chapters);
      }

      if (entities.length > 0) {
        await db.entities.bulkAdd(entities);
      }
    });

    set((state) => ({
      projects: sortProjects([project, ...state.projects]),
      activeProjectId: options?.activate === false ? state.activeProjectId : project.id,
      isLoaded: true,
    }));

    return project;
  },

  async updateProject(projectId, input) {
    const current = get().projects.find((project) => project.id === projectId);

    if (!current) {
      return;
    }

    const nextProject: Project = {
      ...current,
      ...input,
      title: input.title?.trim() || current.title,
      description: input.description?.trim() ?? current.description,
      genre: input.genre ?? current.genre,
      stylePrompt:
        typeof input.stylePrompt === 'undefined'
          ? current.stylePrompt
          : normalizeProjectStylePrompt(input.stylePrompt),
      templateSnapshot:
        typeof input.templateSnapshot === 'undefined'
          ? current.templateSnapshot
          : input.templateSnapshot,
      generationGateOverride: normalizeProjectGateOverride(
        typeof input.generationGateOverride === 'undefined'
          ? current.generationGateOverride
          : input.generationGateOverride,
      ),
      updatedAt: createTimestamp(),
    };

    await db.projects.put(nextProject);

    set((state) => ({
      projects: sortProjects(
        state.projects.map((project) => (project.id === projectId ? nextProject : project)),
      ),
    }));
  },

  async deleteProject(projectId) {
    await deleteProjectCascade(projectId);

    set((state) => {
      const projects = state.projects.filter((project) => project.id !== projectId);

      return {
        projects,
        activeProjectId:
          state.activeProjectId === projectId ? projects[0]?.id ?? null : state.activeProjectId,
      };
    });
  },

  async exportProjectArchive(projectId) {
    return buildProjectArchive(projectId);
  },

  async importProjectArchive(archive) {
    const project = await importArchiveToDb(archive);
    const projects = sortProjects((await db.projects.toArray()).map(normalizeProject));

    set({
      projects,
      activeProjectId: project.id,
      isLoaded: true,
    });

    return normalizeProject(project);
  },

  setActiveProject(projectId) {
    set({ activeProjectId: projectId });
  },
}));
