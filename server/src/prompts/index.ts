import { ANTI_AI_PROMPT } from './anti-ai-rules.js';
import { COOL_POINTS_PROMPT } from './cool-points.js';
import { CORE_CONSTRAINTS_PROMPT } from './core-constraints.js';
import { NO_POISON_PROMPT } from './no-poison.js';
import { STRAND_WEAVE_PROMPT } from './strand-weave.js';

export interface PromptConfig {
  enableCoreConstraints?: boolean;
  enableAntiAI?: boolean;
  enableStrandWeave?: boolean;
  enableCoolPoints?: boolean;
  enableNoPoison?: boolean;
}

export const DEFAULT_PROMPT_CONFIG: Required<PromptConfig> = {
  enableCoreConstraints: true,
  enableAntiAI: true,
  enableStrandWeave: true,
  enableCoolPoints: false,
  enableNoPoison: true,
};

export const WRITING_RULES_MARKER = '─── 以下为写作规则约束 ───';

export function buildWritingRulesPrompt(config?: Partial<PromptConfig>) {
  const normalizedConfig = {
    ...DEFAULT_PROMPT_CONFIG,
    ...config,
  };
  const sections = [WRITING_RULES_MARKER];

  if (normalizedConfig.enableCoreConstraints) {
    sections.push(CORE_CONSTRAINTS_PROMPT);
  }

  if (normalizedConfig.enableAntiAI) {
    sections.push(ANTI_AI_PROMPT);
  }

  if (normalizedConfig.enableStrandWeave) {
    sections.push(STRAND_WEAVE_PROMPT);
  }

  if (normalizedConfig.enableCoolPoints) {
    sections.push(COOL_POINTS_PROMPT);
  }

  if (normalizedConfig.enableNoPoison) {
    sections.push(NO_POISON_PROMPT);
  }

  return sections.join('\n\n').trim();
}
