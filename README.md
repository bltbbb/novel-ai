# AI Novel Studio

AI Novel Studio 是一个面向长篇小说创作的本地优先写作工作台。

当前仓库已不再是早期 MVP 写作器，主线已经进入“生成引擎 + 分层记忆 + 可调试检索增强”阶段。

当前已经具备以下能力：

- 项目、章节、设定的本地持久化
- TipTap 富文本编辑
- `Plan → Write → Style → Review → Polish → Extract` 六步生成链路
- 服务端 SQLite 持久层，已接入生成任务、结构化产物、记忆切片、向量缓存
- 分层记忆组装：长期记忆、工作记忆、检索记忆
- 统一检索主链与调试面板
- 卷级总结、伏笔快照、轻量召回与结构化关系查询的第一版能力
- 上下文预览与 AI 监控面板
- Markdown 导出
- AI 服务离线降级
- 多条 e2e 回归验证脚本

## 当前主线

当前仓库的文档与执行口径如下：

- 当前状态与交接结论以 `HANDOFF.md` 为准
- 当前开发主线以 `ROADMAP.md` 为准
- `PLAN.md` 保留分层规划与历史背景，不再作为唯一执行进度文档

当前主线已经从“`4.3b` 主链接入评估”推进到“`4.3b` 最小正式接入已落地”。

当前建议的下一步是：

- 对 `4.3b` 继续做接入后定向校准与边界复核
- 继续分析哪些章节类型不会触发 `graph_2hop`
- 观察 `onehop_sufficient / twohop_redundant / sparse_history / onehop_noise_without_twohop` 这 4 类非触发场景在后续样本里的占比
- 可直接使用 `server/npm run calibration:round43b-distribution` 查看当前 synthetic / demo 分布
- 将 `4.5` 向量检索基础设施转入回归监测

## 仓库结构

```text
novel-ai/
  app/                    # 正式前端
  server/                 # 正式后端
  原型/ai-novel-studio/   # 历史原型，仅供参考
  HANDOFF.md              # 当前交接状态、边界与下一步建议
  ROADMAP.md              # 当前主线路线图
  PLAN.md                 # 分层规划与历史执行背景
  RETRIEVAL-CALIBRATION.md # 检索参数标定说明
  RETRIEVAL-CALIBRATION-LOG.md # 检索参数标定执行记录
```

## 当前运行方式

### 0. 运行前提

- 后端运行时要求 `Node.js 22.22+`
- 当前服务端已使用 `node:sqlite`，`Node.js 20.x` 只够编译，不足以稳定完成运行态验证
- Windows 环境可直接使用 `nvm` 切换，例如：`nvm use 22.22.2`

### 1. 启动后端

```powershell
cd server
npm install
npm run dev
```

默认读取 `server/.env`。

如需写入服务端检索参数标定样本，可执行：

```powershell
cd server
npm run seed:calibration
```

`server/.env` 可按以下格式配置 OpenAI 兼容服务：

```env
OPENAI_API_KEY=your_api_key
OPENAI_BASE_URL=http://localhost:8317/v1
PORT=3001
HOST=0.0.0.0
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
OPENAI_MODEL=gpt-5.4-mini

# embedding 默认可复用 OPENAI provider，也可单独拆到别的 provider
EMBEDDING_API_KEY=
EMBEDDING_BASE_URL=
EMBEDDING_DIMENSIONS=
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

如果要把向量检索单独接到智谱 `embedding-3`，可配置成：

```env
OPENAI_API_KEY=your_chat_provider_key
OPENAI_BASE_URL=https://your-chat-provider/v1
OPENAI_MODEL=gpt-5.4-mini

EMBEDDING_API_KEY=your_embedding_provider_key
EMBEDDING_BASE_URL=https://open.bigmodel.cn/api/paas/v4
EMBEDDING_DIMENSIONS=2048
OPENAI_EMBEDDING_MODEL=embedding-3
```

未配置 `EMBEDDING_API_KEY / EMBEDDING_BASE_URL` 时，embedding 会自动回退到 `OPENAI_*` 这套 provider。

当 `EMBEDDING_BASE_URL=https://open.bigmodel.cn/api/paas/v4` 且 `OPENAI_EMBEDDING_MODEL=embedding-3` 时，服务端会改用智谱官方原生 `POST /embeddings` 接口，而不是 OpenAI SDK 的兼容路径。

## sqlite-vec 最小 PoC

当前仓库已补一个最小 `sqlite-vec` 可行性验证脚本，只验证：

- Windows / `node:sqlite` 下能否加载 `sqlite-vec`
- 能否创建 `vec0` 虚表
- 能否写入向量
- 能否执行最近邻查询

执行命令：

```powershell
cd server
npm install
npm run sqlite-vec:poc
```

如果要验证“json_cache 继续保留，同时 sqlite-vec 同步写索引”的阶段 1 写入链路，可执行：

```powershell
cd server
npm run sqlite-vec:write-smoke
```

该脚本不会切正式读路径，只验证：

- `generation_memory_embeddings` 的 json cache 仍可写
- 当 `GENERATION_VECTOR_BACKEND=sqlite_vec` 时，是否会同步写入 sqlite-vec 索引
- sqlite-vec 不可用时是否会自动回退而不打断原链路

如果自动解析原生扩展失败，可在 `server/.env` 配置：

```env
SQLITE_VEC_EXTENSION_PATH=C:\\absolute\\path\\to\\sqlite-vec-extension.dll
```

### 2. 启动前端

```powershell
cd app
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

开发模式首次进入时，前端会自动写入一组多章稀疏章序的 demo 项目，便于做检索参数标定观察。

前端默认访问 `http://localhost:3001`。

如需修改前端访问的后端地址，可在 `app/.env` 中配置：

```env
VITE_SERVER_URL=http://localhost:3001
```

全局 AI Provider / 模型设置现在统一放在项目列表页入口，项目内仅保留项目文风设置。

## e2e 验证

前端目录内当前提供以下回归脚本：

```powershell
cd app
npm run test:e2e:ai
npm run test:e2e:export
npm run test:e2e:records
npm run test:e2e:archive
npm run test:e2e:graph
npm run test:e2e:inspector
npm run test:e2e:generation
npm run test:e2e:retrieval
```

它们分别验证：

- 点击 AI 续写后正文会变长
- 章节导出和整书导出会生成正确的 Markdown 文件
- 快照、灵感卡片与伏笔最小闭环
- 项目归档导入导出
- 模板创建与关系图谱可见
- Inspector 中的历史检索与一致性提示
- 生成控制台中的 SQLite 维护入口可见、可提交并展示回填结果
- 统一检索主链会同时展示记忆切片、休眠伏笔和卷总结候选
- 设置页和项目级覆盖可直接切换轻量召回权重预设，便于做参数标定

## 原型目录说明

`原型/ai-novel-studio/` 是历史原型目录。

- 它用于保留早期页面设计和交互参考
- 它不是当前正式运行入口
- 当前正式实现以根目录下的 `app/` 和 `server/` 为准

## 文档导航

- `README.md`：快速了解项目定位、运行方式和常用命令
- `HANDOFF.md`：查看当前主线状态、已知边界、建议下一步与交接说明
- `ROADMAP.md`：查看当前阶段的正式开发主线
- `PLAN.md`：查看分层规划、长期形态和历史背景，不作为唯一进度来源
- `RETRIEVAL-CALIBRATION.md`：查看检索参数标定说明与执行口径
- `RETRIEVAL-CALIBRATION-LOG.md`：记录真实标定执行结果

如果是新接手当前仓库，建议阅读顺序：

1. `HANDOFF.md`
2. `ROADMAP.md`
3. `README.md`
4. `PLAN.md`
