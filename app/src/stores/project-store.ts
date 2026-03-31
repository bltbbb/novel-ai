import { create } from 'zustand';
import { db, deleteProjectCascade } from '@/lib/db';
import { createId, createTimestamp } from '@/lib/identity';
import type { Id, Project } from '@/types';

interface CreateProjectInput {
  title?: string;
  description?: string;
  genre?: string[];
}

interface UpdateProjectInput {
  title?: string;
  description?: string;
  genre?: string[];
}

interface ProjectStoreState {
  projects: Project[];
  activeProjectId: Id | null;
  isLoaded: boolean;
  loadProjects: () => Promise<void>;
  createProject: (input?: CreateProjectInput) => Promise<Project>;
  updateProject: (projectId: Id, input: UpdateProjectInput) => Promise<void>;
  deleteProject: (projectId: Id) => Promise<void>;
  setActiveProject: (projectId: Id | null) => void;
}

function sortProjects(projects: Project[]) {
  return [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export const useProjectStore = create<ProjectStoreState>((set, get) => ({
  projects: [],
  activeProjectId: null,
  isLoaded: false,

  async loadProjects() {
    const projects = await db.projects.orderBy('updatedAt').reverse().toArray();

    set((state) => ({
      projects,
      activeProjectId: state.activeProjectId ?? projects[0]?.id ?? null,
      isLoaded: true,
    }));
  },

  async createProject(input) {
    const now = createTimestamp();
    const project: Project = {
      id: createId(),
      title: input?.title?.trim() || '未命名项目',
      description: input?.description?.trim() || '',
      genre: input?.genre ?? [],
      wordCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    await db.projects.put(project);

    set((state) => ({
      projects: sortProjects([project, ...state.projects]),
      activeProjectId: project.id,
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

  setActiveProject(projectId) {
    set({ activeProjectId: projectId });
  },
}));
