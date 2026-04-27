import {
  createBookOutlineSummary,
  createVolumeOutlineSummary,
} from '@/lib/generation-client';
import {
  buildBookOutlineSummary,
  buildVolumeMilestoneSummary,
  buildVolumeOutlineSummary,
} from '@/lib/outline-summary';
import type {
  AIReasoningEffort,
  BookOutlineFields,
  VolumeOutlineFields,
} from '@/types';

interface OutlineSummaryModelConfig {
  model: string;
  temperature: number;
  reasoningEffort?: AIReasoningEffort;
}

interface OutlineSummaryResult<T> {
  fields: T;
  usedFallback: boolean;
  errorMessage?: string;
}

export async function resolveBookOutlineWithAiSummary(input: {
  serverUrl: string;
  modelConfig: OutlineSummaryModelConfig;
  projectTitle: string;
  projectDescription?: string;
  genre: string[];
  fields: BookOutlineFields;
}): Promise<OutlineSummaryResult<BookOutlineFields>> {
  try {
    const response = await createBookOutlineSummary(input.serverUrl, {
      projectTitle: input.projectTitle,
      projectDescription: input.projectDescription,
      genre: input.genre,
      outline: input.fields,
      ...input.modelConfig,
    });

    return {
      fields: {
        ...input.fields,
        summary: response.summary.trim() || buildBookOutlineSummary(input.fields),
      },
      usedFallback: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';

    return {
      fields: {
        ...input.fields,
        summary: buildBookOutlineSummary(input.fields),
      },
      usedFallback: true,
      errorMessage: message,
    };
  }
}

export async function resolveVolumeOutlineWithAiSummary(input: {
  serverUrl: string;
  modelConfig: OutlineSummaryModelConfig;
  projectTitle: string;
  projectDescription?: string;
  volumeTitle: string;
  volumeOrder: number;
  bookOutlineSummary?: string;
  fields: VolumeOutlineFields;
}): Promise<OutlineSummaryResult<VolumeOutlineFields>> {
  const fallbackSummary = buildVolumeOutlineSummary(input.fields);
  const fallbackMilestoneSummaries = input.fields.milestones.map((milestone, index) =>
    buildVolumeMilestoneSummary(milestone, index),
  );

  try {
    const response = await createVolumeOutlineSummary(input.serverUrl, {
      projectTitle: input.projectTitle,
      projectDescription: input.projectDescription,
      volumeTitle: input.volumeTitle,
      volumeOrder: input.volumeOrder,
      bookOutlineSummary: input.bookOutlineSummary,
      outline: input.fields,
      ...input.modelConfig,
    });

    return {
      fields: {
        ...input.fields,
        summary: response.summary.trim() || fallbackSummary,
        milestones: input.fields.milestones.map((milestone, index) => ({
          ...milestone,
          summary: response.milestoneSummaries[index]?.trim() || fallbackMilestoneSummaries[index],
        })),
      },
      usedFallback: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';

    return {
      fields: {
        ...input.fields,
        summary: fallbackSummary,
        milestones: input.fields.milestones.map((milestone, index) => ({
          ...milestone,
          summary: fallbackMilestoneSummaries[index],
        })),
      },
      usedFallback: true,
      errorMessage: message,
    };
  }
}
