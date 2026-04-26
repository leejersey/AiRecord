<p align="center">
  <h1 align="center">🎙️ AiRecord</h1>
  <p align="center"><strong>AI 驱动的智能录音助手 — 录音 → 转写 → 分析 → 知识沉淀</strong></p>
  <p align="center">
    <img src="https://img.shields.io/badge/FastAPI-0.115.12-009688?logo=fastapi" alt="FastAPI" />
    <img src="https://img.shields.io/badge/Expo_SDK-54-000020?logo=expo" alt="Expo" />
    <img src="https://img.shields.io/badge/React_Native-0.81-61DAFB?logo=react" alt="React Native" />
    <img src="https://img.shields.io/badge/DeepSeek-AI-blue?logo=openai" alt="DeepSeek" />
    <img src="https://img.shields.io/badge/ChromaDB-1.0-orange" alt="ChromaDB" />
    <img src="https://img.shields.io/badge/Python-3.11+-3776AB?logo=python" alt="Python" />
    <img src="https://img.shields.io/badge/License-MIT-green" alt="License" />
  </p>
</p>

---

## ✨ 产品简介

AiRecord 是一款全栈 AI 录音应用，将语音录制、自动转写、智能分析和知识管理集成到一个移动端友好的平台中。支持多种使用场景（会议、面试、灵感速记），通过 RAG 知识库实现跨录音语义检索和对话式问答。

### 🎯 核心价值

| 场景 | 传统方式 | AiRecord |
|------|----------|----------|
| 会议纪要 | 手动记录、事后整理 | 自动转写 + AI 提取摘要/待办/决策 |
| 面试评估 | 主观印象、记忆偏差 | 四维度量化评分 + 横向对比矩阵 |
| 灵感捕捉 | 笔记本、备忘录 | 语音快速记录 + AI 结构化整理 |
| 知识回溯 | 翻找笔记、搜索困难 | RAG 语义搜索 + 对话式问答 |

---

## 📱 功能一览

### 🔴 录音与转写
- **一键录音** — 支持会议 / 面试 / 灵感三种场景
- **火山引擎 ASR** — 高精度中文语音转写（自动长音频分片）
- **自动流水线** — 录音完成后自动触发转写 → 分析 → 入库

### 🤖 AI 智能分析
- **场景化 Prompt** — 会议/面试/灵感各有专属分析模板
- **多维度输出** — 摘要、要点、话题标签、待办事项、情感分析
- **面试评估** — 技术能力/沟通表达/逻辑思维/文化匹配 四维度打分

### 📚 RAG 知识库
- **ChromaDB 向量存储** — 转录文本 + 分析结果自动分块入库
- **对话式查询** — 自然语言提问，AI 基于录音历史回答
- **知识图谱** — 话题共现网络可视化 + 关联探索
- **跨录音关联** — 自动推荐语义相关的录音

### 📊 数据洞察
- **仪表盘** — 录音总量、时长统计、场景分布、完成率
- **周报生成** — 自动汇总本周录音、待办、高频话题
- **僵尸议题检测** — 发现反复讨论但未推进的话题
- **待办健康度** — 100 分制健康评分

### 🎯 面试对比矩阵
- **候选人排行** — 按综合评分自动排名
- **横向对比** — 多候选人多维度并排对比
- **HR 报告** — 一键导出 Markdown 格式评估报告

### ⚡ 更多特性
- **语音搜索** — 麦克风输入搜索词
- **高光时刻** — AI 自动标记关键时间点，点击跳转播放
- **全文搜索** — SQLite FTS5 全文索引
- **iOS Shortcuts** — 快捷指令获取今日摘要/待办/周报
- **Docker 部署** — 一键部署到生产服务器
- **日志系统** — RotatingFileHandler 轮转日志，生产环境自动写入文件

---

## 🏗 技术架构

```
┌─────────────────────────────────────────────────┐
│                 📱 Expo SDK 54 / React Native    │
│  ┌──────────┐ ┌──────────┐ ┌─────┐ ┌──────────┐ │
│  │ 录音首页 │ │ 录音历史 │ │ 待办 │ │   设置   │ │
│  └──────────┘ └──────────┘ └─────┘ └──────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ 知识库   │ │ 面试对比 │ │   知识图谱       │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
├─────────────────────────────────────────────────┤
│                  🌐 REST API (31 端点)           │
├─────────────────────────────────────────────────┤
│             ⚡ FastAPI 0.115.12 + Uvicorn        │
│  ┌────────────────────────────────────────────┐  │
│  │ Routers                                    │  │
│  │ recordings · todos · stats · knowledge     │  │
│  │ interviews · shortcuts                     │  │
│  ├────────────────────────────────────────────┤  │
│  │ Services                                   │  │
│  │ asr_service    → 火山引擎 ASR              │  │
│  │ ai_service     → DeepSeek LLM             │  │
│  │ knowledge_svc  → ChromaDB RAG             │  │
│  │ storage_svc    → 文件管理                  │  │
│  ├────────────────────────────────────────────┤  │
│  │ Storage                                    │  │
│  │ SQLite (FTS5) · ChromaDB · 本地文件系统    │  │
│  └────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────┤
│            🐳 Docker + Nginx (生产)              │
└─────────────────────────────────────────────────┘
```

---

## 📂 项目结构

```
AiRecord/
├── client/                        # 📱 前端 (Expo SDK 54 / React Native 0.81)
│   ├── app/
│   │   ├── (tabs)/
│   │   │   ├── _layout.tsx       # 🧭 Tab 导航布局
│   │   │   ├── index.tsx         # 🎙️ 录音首页
│   │   │   ├── history.tsx       # 📋 录音历史 + 语音搜索
│   │   │   ├── todos.tsx         # ✅ 待办管理
│   │   │   └── settings.tsx      # ⚙️ 设置 + 功能入口
│   │   ├── recording/[id].tsx    # 📄 录音详情 + 分析报告
│   │   ├── knowledge.tsx         # 💬 知识库对话查询
│   │   ├── interviews.tsx        # 🎯 面试对比矩阵
│   │   ├── topic-graph.tsx       # 🌐 知识图谱可视化
│   │   ├── _layout.tsx           # 📐 根导航布局
│   │   ├── +html.tsx             # 🌐 Web 模板
│   │   └── +not-found.tsx        # 404 页面
│   ├── components/
│   │   ├── Waveform.tsx          # 🌊 录音波形动画
│   │   ├── Themed.tsx            # 🎨 主题化组件
│   │   └── ...                   # 其他通用组件
│   ├── services/
│   │   ├── api.ts                # 🔗 Axios API 客户端
│   │   ├── audioPlayer.ts        # 🔊 音频播放服务
│   │   └── audioRecorder.ts      # 🎤 录音服务封装
│   ├── stores/
│   │   └── recordingStore.ts     # 📦 Zustand 状态管理
│   ├── constants/
│   │   ├── theme.ts              # 🎨 设计令牌
│   │   └── Colors.ts             # 🎨 色彩常量
│   └── types/index.ts            # 📝 TypeScript 类型定义
│
├── server/                        # ⚡ 后端 (FastAPI 0.115.12)
│   ├── app/
│   │   ├── main.py               # 🚀 应用入口 + 生命周期 + 日志
│   │   ├── config.py             # ⚙️ Pydantic Settings 配置
│   │   ├── database/
│   │   │   └── connection.py     # 🗄️ SQLite + FTS5 初始化
│   │   ├── models/
│   │   │   └── recording.py      # 📋 Pydantic 数据模型
│   │   ├── routers/
│   │   │   ├── recordings.py     # 🎙️ 录音 CRUD + 转写/分析
│   │   │   ├── todos.py          # ✅ 待办 CRUD + 逾期检测
│   │   │   ├── stats.py          # 📊 仪表盘 + 周报 + 僵尸议题
│   │   │   ├── knowledge.py      # 📚 RAG 查询 + 语义搜索 + 图谱
│   │   │   ├── interviews.py     # 🎯 候选人对比 + HR 报告
│   │   │   └── shortcuts.py      # 🍎 iOS Shortcuts 纯文本接口
│   │   └── services/
│   │       ├── asr_service.py    # 🎤 火山引擎 ASR 集成
│   │       ├── ai_service.py     # 🧠 DeepSeek LLM 分析
│   │       ├── knowledge_service.py # 📚 ChromaDB RAG 管道
│   │       └── storage_service.py # 💾 文件存储管理
│   ├── logs/                      # 📜 运行日志（自动轮转）
│   ├── uploads/                   # 📁 录音文件存储
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── .env.example               # 🔒 环境变量模板
│   └── .env                       # 🔒 环境变量（不入库）
│
├── deploy/                        # 🐳 部署配置
│   ├── nginx.conf                 # Nginx 反向代理
│   ├── deploy.sh                  # 一键部署脚本
│   └── ssl/                       # HTTPS 证书目录
│
├── docker-compose.yml             # 容器编排
└── .gitignore                     # Git 忽略规则
```

---

## 🚀 快速开始

### 前置要求

- **Node.js** ≥ 18 + **npm**
- **Python** ≥ 3.11
- **ffmpeg**（音频分片处理，ASR 要求 ≤30s 片段）
- **火山引擎账号**（ASR 语音识别）
- **DeepSeek API Key**（AI 分析）

### 1️⃣ 克隆项目

```bash
git clone https://github.com/your-username/AiRecord.git
cd AiRecord
```

### 2️⃣ 启动后端

```bash
cd server

# 创建虚拟环境
python3 -m venv venv
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入以下密钥：
#   VOLCANO_ACCESS_KEY=你的火山引擎AccessKey
#   VOLCANO_SECRET_KEY=你的火山引擎SecretKey
#   VOLCANO_APP_ID=你的火山引擎AppId
#   DEEPSEEK_API_KEY=你的DeepSeek密钥

# 启动服务（开发模式）
DEV_MODE=1 python -m app.main
# 或
DEV_MODE=1 uvicorn app.main:app --reload --port 8000
```

后端启动后访问 http://localhost:8000/docs 查看 Swagger API 文档。

> **注意**：不设置 `DEV_MODE=1` 时，日志将同时写入 `server/logs/airecord.log`（10MB 自动轮转，保留 5 份）。

### 3️⃣ 启动前端

```bash
cd client

# 安装依赖
npm install

# 启动 Expo 开发服务器
npx expo start
```

使用 Expo Go 扫码在手机上预览，或按 `i` 启动 iOS 模拟器。

### 4️⃣ 生产部署（Docker）

```bash
# 一键启动
docker-compose up -d

# 或使用部署脚本（rsync 到远程服务器）
bash deploy/deploy.sh
```

容器架构：
- **airecord-api** — FastAPI 后端（端口 8000）
- **airecord-nginx** — Nginx 反向代理（端口 80/443）

数据持久化卷：
- `./server/uploads` → 录音文件
- `./server/app/airecord.db` → SQLite 数据库

---

## 🔌 API 概览 (31 端点)

> API 版本：`v0.2.0` | 基础路径：`/api`

| 模块 | 端点 | 说明 |
|------|------|------|
| **系统** | `GET /health` | 健康检查 |
| **录音** | `POST /api/recordings/upload` | 上传录音 |
| | `GET /api/recordings` | 录音列表 |
| | `GET /api/recordings/{id}` | 录音详情 |
| | `PATCH /api/recordings/{id}` | 更新录音 |
| | `DELETE /api/recordings/{id}` | 删除录音 |
| | `GET /api/recordings/{id}/status` | 处理状态 |
| | `POST /api/recordings/{id}/transcribe` | 触发转写 |
| | `POST /api/recordings/{id}/analyze` | 触发 AI 分析 |
| | `GET /api/recordings/{id}/audio` | 音频流 (支持 Range) |
| | `GET /api/recordings/{id}/export` | 导出报告 |
| | `GET /api/recordings/search` | 全文搜索 (FTS5) |
| **待办** | `GET /api/todos` | 待办列表 |
| | `GET /api/todos/{id}` | 待办详情 |
| | `PATCH /api/todos/{id}` | 更新待办状态 |
| | `DELETE /api/todos/{id}` | 删除待办 |
| **统计** | `GET /api/stats/dashboard` | 仪表盘数据 |
| | `GET /api/stats/weekly-report` | 周报生成 |
| | `GET /api/stats/zombie-topics` | 僵尸议题检测 |
| **知识库** | `POST /api/knowledge/query` | RAG 对话查询 |
| | `GET /api/knowledge/search` | 语义搜索 |
| | `GET /api/knowledge/related/{id}` | 相关录音推荐 |
| | `GET /api/knowledge/graph` | 知识图谱数据 |
| | `POST /api/knowledge/reindex` | 重建向量索引 |
| | `GET /api/knowledge/stats` | 知识库统计 |
| **面试** | `GET /api/interviews/candidates` | 候选人列表 |
| | `GET /api/interviews/compare` | 横向对比 |
| | `GET /api/interviews/report/{id}` | HR 评估报告 |
| **快捷指令** | `GET /api/shortcuts/today` | 今日摘要 (纯文本) |
| | `GET /api/shortcuts/todos` | 待办清单 (纯文本) |
| | `GET /api/shortcuts/weekly` | 周报 (纯文本) |

---

## ⚙️ 环境变量

在 `server/.env` 中配置（参考 `server/.env.example`）：

```env
# 🎤 火山引擎 ASR（语音识别）
# 获取方式: https://console.volcengine.com/speech/service/8
VOLCANO_ACCESS_KEY=your_access_key
VOLCANO_SECRET_KEY=your_secret_key
VOLCANO_APP_ID=your_app_id

# 🧠 DeepSeek LLM（AI 分析）
# 获取方式: https://platform.deepseek.com/api_keys
DEEPSEEK_API_KEY=your_deepseek_key

# 📦 可选配置
# DATABASE_URL=sqlite+aiosqlite:///./airecord.db
# HOST=0.0.0.0
# PORT=8000
```

---

## 🍎 iOS Shortcuts 集成

AiRecord 提供纯文本 API，可直接在 iOS 快捷指令中使用：

1. 打开 **快捷指令** App → 新建快捷指令
2. 添加 **「获取URL内容」** 动作
3. 输入 `http://你的服务器:8000/api/shortcuts/today`
4. 添加 **「显示结果」** 动作

可用端点：
- `/api/shortcuts/today` — 今日录音摘要
- `/api/shortcuts/todos` — 待办清单
- `/api/shortcuts/weekly` — 周报

---

## 🛠 技术栈

| 层级 | 技术 | 版本 | 用途 |
|------|------|------|------|
| **前端框架** | Expo (React Native) | SDK 54 / RN 0.81 | 跨平台移动应用 |
| **状态管理** | Zustand | 5.0 | 轻量级状态管理 |
| **网络请求** | Axios | 1.15 | HTTP 客户端 |
| **音频处理** | expo-av | 16.0 | 录音 & 播放 |
| **UI 组件** | React Native Paper | 5.15 | Material Design 组件 |
| **动画** | React Native Reanimated | 4.1 | 高性能原生动画 |
| **后端框架** | FastAPI + Uvicorn | 0.115.12 | 高性能异步 API |
| **数据验证** | Pydantic | 2.11 | 数据模型 + Settings |
| **数据库** | SQLite + FTS5 | — | 关系存储 + 全文搜索 |
| **向量数据库** | ChromaDB | 1.0.7 | RAG 语义检索 |
| **语音识别** | 火山引擎 ASR | One-shot API | 中文语音转文字 |
| **AI 分析** | DeepSeek (OpenAI兼容) | — | 场景化智能分析 |
| **HTTP 客户端** | httpx | 0.28 | 异步 HTTP 请求 |
| **音频转换** | ffmpeg + pydub | 0.25 | 格式标准化 + 长音频分片 |
| **部署** | Docker + Nginx | — | 容器化 + 反向代理 |

---

## 📈 项目进度

```
总进度: █████████████████████ 96% (101/105)

✅ 已完成 & 联调通过:
  Phase 1-9   基础架构 + 录音 + 转写 + 分析 + UI
  Phase 11-12 UI 优化 + 待办管理
  Phase 13    语音搜索 + 高光回放
  Phase 14    RAG 知识图谱
  Phase 15    面试对比矩阵
  Phase 16    待办闭环 + iOS Shortcuts
  Phase 17    部署方案 (Docker/Nginx)
  Hotfix      火山 ASR 长音频分片 + 前端显示同步

⬜ 待完成 (需要真实设备/服务器):
  Phase 10    真机测试验收 (2 项)
  Phase 17    生产部署 + HTTPS (2 项)
```

---

## 🧪 联调验证

最近一次联调 (`2026-04-26`) 的结果:

| 维度 | 结果 |
|------|------|
| **TypeScript 编译** | ✅ `0 errors` |
| **后端 API (31 端点)** | ✅ 全部返回正确响应，无 500 错误 |
| **前端页面 (8 页)** | ✅ 录音 / 历史 / 待办 / 设置 / 详情 / 知识库 / 面试 / 图谱 全部正常 |
| **路由跳转** | ✅ 设置页 → 子功能页面导航通畅 |
| **数据流** | ✅ 前后端 JSON 结构匹配 |
| **ASR 转写** | ✅ 火山引擎 One-shot API + ffmpeg 长音频分片 |
| **AI 分析** | ✅ 场景化 Prompt + DeepSeek 分析流水线 |

### 修复记录

| 日期 | 问题 | 文件 | 修复 |
|------|------|------|------|
| 04-25 | JSX 结构错误（Fragment 缺失） | `recording/[id].tsx` | 用 `<>...</>` 包裹 analysis + related 区块 |
| 04-25 | TypeScript `useRef` 缺少初始值 | `history.tsx` | 添加 `undefined` 参数 |
| 04-25 | 健康检查路径不规范 | `settings.tsx` | `getBaseUrl() + '/health'` |
| 04-25 | SQL 查询引用不存在的列 | `stats.py` | 移除 `t.priority` |
| 04-26 | ASR 30s 限制导致长音频转写失败 | `asr_service.py` | ffmpeg 自动分片 + 结果拼接 |
| 04-26 | 转写完成后前端未同步显示 | `recording/[id].tsx` | 轮询状态 + 数据刷新 |

---

## 🖥 界面预览

<details>
<summary>📱 展开查看界面截图说明</summary>

### 主要页面

| 页面 | 功能 |
|------|------|
| 🎙 **录音首页** | 场景选择（会议/面试/灵感）+ 一键录音 + 实时计时 + 波形动画 |
| 📋 **录音历史** | 搜索栏（支持语音🎤）+ 场景筛选 + 卡片列表 |
| ✅ **待办管理** | 三状态筛选（待办/已完成/逾期）+ 滑动操作 |
| ⚙️ **设置** | 自动转写/分析开关 + 知识库/面试对比/知识图谱入口 + 服务状态 |
| 📄 **录音详情** | 三 Tab 切换（转录/分析/待办）+ 音频播放 + 相关录音推荐 |
| 💬 **知识库** | Chat 式对话 + AI 回答 + 来源引用卡片 + 建议问题 |
| 🎯 **面试对比** | 候选人排名 + 四维分数条 + 多选对比 + 长按导出报告 |
| 🌐 **知识图谱** | 话题气泡图 + 排行榜 + 关联探索 + 场景颜色编码 |

</details>

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

## 📄 License

MIT License © 2026 AiRecord
