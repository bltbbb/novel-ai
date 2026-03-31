# AI Novel Studio

AI Novel Studio 是一个面向长篇小说创作的本地优先写作工作台。

当前仓库已经具备以下能力：

- 项目、章节、设定的本地持久化
- TipTap 富文本编辑
- 真实 AI 续写链路
- 上下文预览与 AI 监控面板
- Markdown 导出
- AI 服务离线降级
- 多条 e2e 回归验证脚本

## 仓库结构

```text
novel-ai/
  app/                    # 正式前端
  server/                 # 正式后端
  原型/ai-novel-studio/   # 历史原型，仅供参考
  PLAN.md                 # 分层计划与执行记录
```

## 当前运行方式

### 1. 启动后端

```powershell
cd server
npm install
npm run dev
```

默认读取 `server/.env`。

`server/.env` 可按以下格式配置 OpenAI 兼容服务：

```env
OPENAI_API_KEY=your_api_key
OPENAI_BASE_URL=http://localhost:8317/v1
PORT=3001
HOST=0.0.0.0
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
OPENAI_MODEL=gpt-5.4-mini
```

### 2. 启动前端

```powershell
cd app
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

前端默认访问 `http://localhost:3001`，也可以在工作台“设置”里调整。

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
```

它们分别验证：

- 点击 AI 续写后正文会变长
- 章节导出和整书导出会生成正确的 Markdown 文件
- 快照、灵感卡片与伏笔最小闭环
- 项目归档导入导出
- 模板创建与关系图谱可见
- Inspector 中的历史检索与一致性提示

## 原型目录说明

`原型/ai-novel-studio/` 是历史原型目录。

- 它用于保留早期页面设计和交互参考
- 它不是当前正式运行入口
- 当前正式实现以根目录下的 `app/` 和 `server/` 为准

## 计划文档

执行进度见 `PLAN.md`。
