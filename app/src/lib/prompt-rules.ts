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

const CORE_CONSTRAINTS_PROMPT = `## 写作核心约束（三大定律）

1. 大纲即法律：严格遵守既定情节走向，不擅自偏题。
2. 设定即物理：人物实力、物品能力、势力边界必须与已知设定一致。
3. 发明需识别：若引入新角色、地点、物品或势力，必须给予清晰名称和足够描写。

## 章节硬约束

- 本章必须让读者看懂“发生了什么 / 谁在做什么 / 为什么”。
- 本章必须有明确推进：问题、目标、代价、关系变化、信息变化至少出现一项。
- 若上文已经给出钩子或未闭合问题，本章必须回应。
- 禁止输出占位正文，例如 [待补充]、TODO、……省略。`;

const ANTI_AI_PROMPT = `## Anti-AI 七层检查

### 高危词汇与套话

以下表达及同类说法优先改写，避免总结腔、说明腔和流水账：
- 总结归纳词：综合、总之、综上、归根结底、总体而言、由此可见。
- 枚举模板词：首先、其次、再次、最后、第一、第二、一方面、另一方面。
- 学术书面腔：某种程度上、本质上、层面上、体现为、形成了、推动了、呈现出。
- 情绪直述词：非常愤怒、百感交集、心潮起伏、内心一震、感到无奈、感到恐惧。
- 动作套话：皱起眉头、叹了口气、深吸一口气、缓缓开口、冷冷说道、眼神一凝。
- 环境套话：空气仿佛凝固、夜色如墨、死一般的寂静、时间仿佛静止、就在这一刻。
- 机械开场收尾：让我们把视线转到、故事才刚刚开始、真正的考验还在后面。

### 句式与结构

- 禁止“首先 / 其次 / 最后”三段式说明写法。
- 禁止连续三句相同句式平铺叙述。
- 每 3 到 5 段至少出现一次明显的句长变化或动作打断。
- 对话必须带意图，避免说明书式对白。
- 每 300 字内“很 / 非常 / 极其 / 十分”总数不超过 4。
- 禁止连续使用“……”或“！！！”。

### 改写原则

1. 抽象情绪优先改成生理反应 + 当下意图 + 下一动作。
2. 结论句优先改成事实细节 + 代价或风险 + 决策。
3. 连续说明句优先拆成“对白 / 动作 / 反问”混排。`;

const STRAND_WEAVE_PROMPT = `## Strand Weave 三线节奏

- Quest（主线推进）建议占比 55% 到 65%。
- Fire（情感 / 关系）建议占比 20% 到 30%。
- Constellation（世界观 / 势力 / 设定展开）建议占比 10% 到 20%。

写作时默认遵守以下节奏约束：
- 主线连续推进过久时，要适当插入情感线或世界观线缓冲。
- 感情线不宜长期缺席，避免人物关系像静止背景板。
- 世界观线不宜长期缺席，避免故事只剩冲突而没有世界扩展。
- 当前章节至少要让其中一条线有明确推进，最好两条线同时被照亮。`;

const COOL_POINTS_PROMPT = `## 爽点工程

- 优先采用“铺垫 -> 兑现 -> 余波”结构，避免无准备的硬爆点。
- 小爽点应服务章节节奏，里程碑爽点应改变人物地位、局势或读者预期。
- 常用模式包括：装逼打脸、扮猪吃虎、越级反杀、打脸权威、反派翻车、甜蜜超预期。
- 爽点必须建立在前文信息和角色动机之上，不能为了刺激而牺牲逻辑。`;

const NO_POISON_PROMPT = `## 毒点规避

严禁以下五类问题：
1. 降智推进：角色故意忽略常识，只为推动剧情。
2. 强行误会：明明一句话能说清，却硬拖数段或数章。
3. 圣母无代价：高风险对象被轻易原谅，却没有条件与代价。
4. 工具人配角：配角只在功能节点出现，没有独立目标。
5. 双标裁决：同类行为被双重标准评价，却没有立场或信息差解释。

若剧情确实需要冒险推进，至少补足“动机 / 阻力 / 代价”中的两项。`;

function normalizePromptConfig(config?: Partial<PromptConfig>) {
  return {
    ...DEFAULT_PROMPT_CONFIG,
    ...config,
  };
}

export function buildWritingRulesPrompt(config?: Partial<PromptConfig>) {
  const normalizedConfig = normalizePromptConfig(config);
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
