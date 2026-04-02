# AI Novel Studio MVP 发布说明

## 版本定位

当前版本是本地优先的 MVP。

目标是验证以下闭环是否成立：

1. 创建项目  
2. 创建章节  
3. 编写正文  
4. 使用 AI 续写  
5. 查看上下文预览  
6. 导出 Markdown  

当前版本已经达到可交付状态，但仍属于 MVP，不是完整产品形态。

## 当前包含

- 项目、章节、设定的本地持久化
- TipTap 富文本编辑
- 真实 AI 续写链路
- Context Inspector 预览
- Markdown 导出
- AI 服务离线降级
- 基础 e2e 回归验证

## 当前不包含

- 伏笔系统正式数据化
- Brainstorming 持久化
- RAG / 向量检索
- JSON 项目导入导出
- DOCX / EPUB 导出
- 关系图谱
- 版本快照与 Diff

## 目录说明

```text
novel-ai/
  app/                    # 正式前端
  server/                 # 正式后端
  原型/ai-novel-studio/   # 历史原型，仅供参考
  README.md               # 启动与使用说明
  PLAN.md                 # 分层计划与执行记录
  RELEASE.md              # 当前发布说明
```

## 运行前提

### 前端

```powershell
cd app
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

### 后端

```powershell
cd server
nvm use 22.22.2
npm install
npm run dev
```

### 后端环境变量

参考 [server/.env.example](H:/myproject/novel-ai/server/.env.example)。

当前兼容的 OpenAI 风格配置格式如下：

```env
OPENAI_API_KEY=your_api_key
OPENAI_BASE_URL=http://localhost:8317/v1
PORT=3001
HOST=0.0.0.0
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
OPENAI_MODEL=gpt-5.4-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

### 运行时说明

- 后端当前要求 `Node.js 22.22+`
- 原因是服务端已使用 `node:sqlite`，低于 22 的环境会卡在运行态验证

### 前端默认设置

- 默认后端地址：`http://localhost:3001`
- 默认模型：`gpt-5.4-mini`
- 默认温度：`0.7`

这些值可以在工作台里的“设置”面板中修改。

## 发布前验证

### 基础可用性

- 确认前端可访问：`http://127.0.0.1:5173`
- 确认后端健康检查可访问：`http://127.0.0.1:3001/api/health`

### 构建验证

```powershell
cd app
npm run build

cd ../server
npm run build
```

### e2e 回归

```powershell
cd app
npm run test:e2e:ai
npm run test:e2e:export
```

当前这两条验证分别覆盖：

- AI 续写后正文变长
- 章节与整书 Markdown 导出成功

## 当前已验证结果

截至当前版本，以下验证已通过：

- `app/npm run build`
- `server/npm run build`
- `Node.js 22.22.2` 下 `server` 可真实启动，并通过 `GET /api/health`
- `npm run test:e2e:ai`
- `npm run test:e2e:export`

## 已知限制

1. 当前是本地优先 MVP，功能范围有意收敛。  
2. `Context Inspector` 当前展示的是前端组装出的真实请求预览，不是完整的服务端审计日志。  
3. 编辑器相关 chunk 已拆分，但 `editor` chunk 仍然偏大，后续仍可继续优化。  
4. 伏笔系统、灵感板持久化、RAG 和关系图谱尚未进入正式实现。  
5. 当前仓库目录不是 git 仓库，无法直接提供 `git status` 级别的交付检查。  

## 交接建议

如果由下一位工程师继续推进，建议阅读顺序如下：

1. [README.md](H:/myproject/novel-ai/README.md)
2. [PLAN.md](H:/myproject/novel-ai/PLAN.md)
3. [app/e2e](H:/myproject/novel-ai/app/e2e)
4. [app/src/components](H:/myproject/novel-ai/app/src/components)
5. [server/src](H:/myproject/novel-ai/server/src)

## 下一阶段建议

当前不建议继续横向扩张功能。

如果继续开发，优先级建议是：

1. 伏笔系统正式数据化
2. 灵感卡片与快照
3. JSON 项目导入导出
4. RAG / 长记忆
