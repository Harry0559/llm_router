# LLM Router Trace Viewer

转发 Code Agent 的 LLM 请求，实时拦截并在 Web UI 中可视化分析。

## 架构

```
Claude Code  → localhost:7878  (Anthropic 协议) ─┐
Free Code    → localhost:7879  (Anthropic 协议) ─┼→ 上游 LLM API (由 LLM_UPSTREAM_URL 指定)
Test Code    → localhost:7880  (OpenAI 协议)    ─┘

Web UI       → localhost:3000  (Next.js)
Proxy API    → localhost:3001  (REST + SSE)
```

## 快速启动

```bash
# 1. 安装所有依赖
npm install && npm run install:all

# 2. 同时启动代理服务器和 Web UI
npm run dev
```

或分开启动：
```bash
npm run dev:proxy   # 代理服务器 (端口 7878/7879/7880/3001)
npm run dev:web     # Web UI (端口 3000)
```

## 配置说明

### 启动 llm_router 前

llm_router 需要知道将流量转发到哪个上游 API，通过环境变量指定：

```bash
set LLM_UPSTREAM_URL=<上游 API 的 base URL，例如 https://api.anthropic.com>
```

未设置此变量时，代理服务器将拒绝启动。

### 启动 Code Agent 前

将 Code Agent 的 API 请求目标指向 llm_router，同时配置你自己的 API Key：

```bash
# 以 Claude Code 为例（Anthropic 协议，对应代理端口 7878）
set ANTHROPIC_BASE_URL=http://localhost:7878
set ANTHROPIC_AUTH_TOKEN=<你的 API Key>
```

Code Agent 的其他配置（模型选择等）保持不变，llm_router 会原样透传所有请求字段。

### 各 Agent 对应端口

| Agent | 端口 | 协议 |
|---|---|---|
| Claude Code | 7878 | Anthropic |
| Free Code / Trae | 7879 | Anthropic |
| Test Code | 7880 | OpenAI |

## Web UI 功能

- **实时更新**：新请求到达时自动刷新（SSE）
- **三栏布局**：会话列表 → Trace 列表 → Trace 详情
- **Messages 视图**：渲染完整对话，包括 system prompt、tool use、tool result
- **Response 视图**：渲染助手回复，tool call 可视化
- **JSON 视图**：可折叠的 JSON 树
- **Headers 视图**：请求/响应头
- **Token 统计**：输入/输出 token 数
