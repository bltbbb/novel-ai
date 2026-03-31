import type { LoreEntityFields, LoreEntityType } from '@/types';

export interface ProjectTemplateSeedChapter {
  title: string;
  content: string;
}

export interface ProjectTemplateSeedEntity {
  type: LoreEntityType;
  name: string;
  description?: string;
  fields?: LoreEntityFields;
  tags?: string[];
  pinned?: boolean;
}

export interface ProjectTemplateDefinition {
  key: string;
  label: string;
  subtitle: string;
  description: string;
  genres: string[];
  suggestedTitle: string;
  suggestedDescription: string;
  chapters: ProjectTemplateSeedChapter[];
  entities: ProjectTemplateSeedEntity[];
}

export const PROJECT_TEMPLATES: ProjectTemplateDefinition[] = [
  {
    key: 'blank',
    label: '空白项目',
    subtitle: '从零开始',
    description: '不预置章节和设定，适合已经有完整想法，想自己搭建世界观的项目。',
    genres: [],
    suggestedTitle: '未命名项目',
    suggestedDescription: '',
    chapters: [],
    entities: [],
  },
  {
    key: 'xianxia',
    label: '仙侠',
    subtitle: '门派、秘境、因果线',
    description: '适合长线升级、宗门势力和天地规则并重的故事开局。',
    genres: ['仙侠', '成长', '冒险'],
    suggestedTitle: '万古仙途',
    suggestedDescription: '一个关于宗门衰落、秘境苏醒与主角逆势成长的长篇仙侠项目。',
    chapters: [
      {
        title: '第1章：山门将闭',
        content: '山风掠过残破山门，青石台阶上的苔痕已经爬到了祖师像脚边。守山弟子在钟声里抬起头，忽然看见远山尽头有一道旧时代的灵光重新亮起。',
      },
    ],
    entities: [
      {
        type: 'character',
        name: '顾长辞',
        description: '没落宗门里最后一名正式弟子，性格克制，天赋并不显眼，却极擅长忍耐与观察。',
        fields: {
          身份: '守山弟子',
          目标: '保住宗门传承',
        },
        tags: ['主角'],
        pinned: true,
      },
      {
        type: 'faction',
        name: '太玄山',
        description: '昔日顶级仙门，如今只剩断裂护山阵和几间残破经阁。',
        fields: {
          状态: '衰落',
          核心资源: '祖师秘境',
        },
      },
      {
        type: 'magic_system',
        name: '灵脉修行',
        description: '修士通过灵脉、丹药和心境共同提升境界，越高境越依赖因果与悟性。',
        fields: {
          入门境界: '炼气',
          核心限制: '灵脉衰竭',
        },
      },
    ],
  },
  {
    key: 'cyberpunk',
    label: '赛博朋克',
    subtitle: '霓虹都市、企业阴影',
    description: '适合高压都市、技术伦理和个人生存对抗企业系统的故事。',
    genres: ['赛博朋克', '悬疑', '动作'],
    suggestedTitle: '雾港协议',
    suggestedDescription: '一座被企业分割的城市里，主角卷入一场关于记忆篡改和城市主控权的阴谋。',
    chapters: [
      {
        title: '第1章：凌晨四点的上行链路',
        content: '雨幕拍打着高架轨道外侧的广告屏，霓虹在积水里碎成一片片故障色块。沈渡刚接入黑市终端，耳边就传来一段本不该存在于自己记忆里的女声。',
      },
    ],
    entities: [
      {
        type: 'character',
        name: '沈渡',
        description: '灰区情报跑腿人，擅长低层网络渗透，对自己的过去缺乏完整记忆。',
        fields: {
          职业: '情报跑腿人',
          弱点: '记忆残缺',
        },
        tags: ['主角'],
        pinned: true,
      },
      {
        type: 'faction',
        name: '雾港数据联合',
        description: '掌握城市主干网络和公共记忆存储的巨型企业联盟。',
        fields: {
          控制领域: '城市网络',
          公开形象: '秩序维护者',
        },
      },
      {
        type: 'item',
        name: '幽栈终端',
        description: '能够临时伪装身份并接入灰区节点的便携式黑市设备。',
        fields: {
          特性: '匿名接入',
          风险: '容易暴露位置',
        },
      },
    ],
  },
  {
    key: 'cthulhu',
    label: '克苏鲁',
    subtitle: '调查、异象、理智裂隙',
    description: '适合调查驱动、逐步揭示真相并伴随认知崩塌的叙事。',
    genres: ['克苏鲁', '调查', '惊悚'],
    suggestedTitle: '深井之下',
    suggestedDescription: '一场看似普通的失踪调查，逐步牵出古老仪式、海雾小镇与不可直视的真相。',
    chapters: [
      {
        title: '第1章：潮汐退去之后',
        content: '码头上的木板还留着昨夜暴雨的潮腥味，巡警提灯照向尽头时，只看见一串走到海里的脚印。林砚蹲下身，发现脚印之间夹着某种不属于人的粘滑痕迹。',
      },
    ],
    entities: [
      {
        type: 'character',
        name: '林砚',
        description: '受雇前来调查失踪案的私家侦探，理性冷静，但对海雾和钟声异常敏感。',
        fields: {
          职业: '私家侦探',
          隐患: '对未知声响过度敏感',
        },
        tags: ['主角'],
        pinned: true,
      },
      {
        type: 'location',
        name: '盐井镇',
        description: '终年被海雾包围的港口小镇，镇民对外来者异常戒备。',
        fields: {
          特征: '终年海雾',
          异常: '深夜钟声',
        },
      },
      {
        type: 'event',
        name: '旧港失踪案',
        description: '近期已有三名渔民在退潮后失踪，只留下不合常理的脚印和湿滑痕迹。',
        fields: {
          起点: '旧港码头',
          当前状态: '调查中',
        },
      },
    ],
  },
  {
    key: 'western_fantasy',
    label: '西幻',
    subtitle: '王国、遗迹、远征',
    description: '适合多种族、多地域和遗迹冒险并行推进的史诗奇幻开局。',
    genres: ['西幻', '史诗', '冒险'],
    suggestedTitle: '灰烬王冠',
    suggestedDescription: '边陲王国动荡将起，一支远征队在古老遗迹中发现足以改写大陆秩序的秘密。',
    chapters: [
      {
        title: '第1章：北境烽烟',
        content: '风雪穿过城垛间隙，把号角声吹得支离破碎。艾琳站在北境城墙上，看见雪原尽头浮起一束古老金光，那正是史书记载中早已沉没的王冠遗迹方向。',
      },
    ],
    entities: [
      {
        type: 'character',
        name: '艾琳',
        description: '北境军团的年轻军官，行动果断，对旧王室传说抱有近乎执念的兴趣。',
        fields: {
          身份: '北境军官',
          特长: '战术与远征',
        },
        tags: ['主角'],
        pinned: true,
      },
      {
        type: 'faction',
        name: '霜原王国',
        description: '位于大陆北境的人类王国，常年承受雪原部族与旧神遗迹的双重压力。',
        fields: {
          首都: '白石城',
          当前局势: '边境紧张',
        },
      },
      {
        type: 'location',
        name: '王冠遗迹',
        description: '埋藏在冰层之下的古代遗迹，据说与旧王室真正的继承权有关。',
        fields: {
          状态: '半封闭',
          风险: '未知魔法回响',
        },
      },
    ],
  },
];

export function getProjectTemplate(key: string) {
  return PROJECT_TEMPLATES.find((template) => template.key === key) ?? PROJECT_TEMPLATES[0];
}
