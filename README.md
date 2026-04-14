# LLM Router

透明代理 + 实时可视化面板，拦截 AI 编程助手（Claude Code、Cursor、Cline 等）发往 LLM API 的所有流量，无需改动 agent 任何配置，开箱即用。

```
Code Agent  →  localhost:7878  →  LLM API（你的 Key、你的模型）
                    ↓
             localhost:3000  （实时 Web 面板）
```

---

## 功能亮点

- **实时监控**：SSE 推送，请求完成即刻出现，无需刷新
- **三级结构**：Session → Run → Trace，自动分组，清晰呈现对话上下文
- **流量分类**：自动区分主 agent（Main）、子 agent（Sub）、标题生成（Title）三种流量
- **上下文压缩检测**：选中两条 trace 对比 messages diff，判断是否发生了 context compression
- **完整请求还原**：Messages、Response、Raw Request、Raw Response、Headers 全部可查
- **Anthropic + OpenAI 双协议**：根据请求路径自动识别，其余路径透明转发不记录

---

## 快速开始

### 1. 安装依赖

```bash
npm install && npm run install:all
```

### 2. 设置上游 API 地址

```bash
# macOS / Linux
export LLM_UPSTREAM_URL=https://api.anthropic.com

# Windows（PowerShell）
$env:LLM_UPSTREAM_URL = "https://api.anthropic.com"

# Windows（命令提示符）
set LLM_UPSTREAM_URL=https://api.anthropic.com
```

> 填入你实际使用的 API 地址，兼容任何 Anthropic / OpenAI 兼容接口。

### 3. 启动

```bash
npm run dev
```

浏览器打开 **http://localhost:3000**，让 agent 跑起来，流量会立即出现。

---

## 接入你的 Agent

将 agent 的 base URL 改为 `http://localhost:7878`，API Key 和其他参数保持不变，代理原样透传所有请求头，agent 无感知。

### Claude Code

```bash
# macOS / Linux
export ANTHROPIC_BASE_URL=http://localhost:7878
export ANTHROPIC_API_KEY=sk-ant-...
claude

# Windows（PowerShell）
$env:ANTHROPIC_BASE_URL = "http://localhost:7878"
$env:ANTHROPIC_API_KEY  = "sk-ant-..."
claude
```

### Cursor / Cline / 其他 OpenAI 兼容 Agent

在 agent 设置中将 base URL 改为 `http://localhost:7878`，无需其他配置。

代理根据请求路径自动识别协议：

| 路径 | 协议 |
|---|---|
| `/v1/messages` | Anthropic |
| `/v1/chat/completions` | OpenAI |

---

## Web 面板

四列布局，每列可独立折叠展开。

### Sessions

每个 agent 对话窗口对应一个 Session，从请求的 `metadata.user_id` 中提取 `session_id` 识别，以 ID 前 8 位命名，支持单独删除或清空全部。

### Runs

同一 Session 内，每次用户发起的新一轮对话为一个 Run。识别规则：主 agent 收到末尾为纯文本 user 消息时判定为新 Run，工具调用返回结果则归入当前 Run 继续。

Run 列表顶部有 **All Traces** 入口，可跳过 Run 分组直接查看该 Session 的全部 trace。

### Traces

每次 LLM 调用对应一条 Trace，显示：

- 流量类型标签：`Main`（蓝）/ `Sub`（紫）/ `Title`（灰）
- HTTP 状态码、耗时、token 消耗（输入 + 输出）
- 使用的模型名称

列表顶部支持按类型多选过滤，仅展示需要的流量。

### 详情面板

| 标签 | 内容 |
|---|---|
| Messages | 完整渲染对话内容，含 system prompt、tool call、tool result |
| Response | 助手回复渲染，tool call 可视化 |
| Raw Request | 原始请求体 JSON |
| Raw Response | 原始响应体 JSON |
| Headers | 请求与响应 header |
| Diff | 两条 trace 的 messages 差异对比（见下方说明） |

---

## Trace Diff：上下文压缩检测

用于对比两条 trace 的 `messages` 数组，判断是否发生了 **context compression**（上下文压缩）。

**使用方式：**

1. 点击任意一条 trace，在详情面板右上角点击「**锁定为基准**」
2. 再点击另一条 trace，详情面板自动出现 **Diff** 标签

**Diff 面板展示：**

- 顶部 banner：压缩判断结论 + 两侧消息数与 token 数对比
- **消失的消息**（红色，默认展开）：在基准 trace 中存在但对比 trace 中消失的消息，即压缩证据
- **共同消息**（灰色，默认折叠）：两侧均存在的消息，压缩后幸存的上下文
- **新增的消息**（绿色，默认展开）：仅在对比 trace 中出现的消息，可能包含压缩后的摘要

判断规则：只要有消息消失（`removed > 0`），即提示可能发生了压缩。

---

## 端口说明

| 服务 | 端口 |
|---|---|
| 代理（接收 agent 请求） | 7878 |
| Web 面板 | 3000 |
| 内部 REST API | 3001 |

---

## 其他

### 单独启动

```bash
npm run dev:proxy   # 仅启动代理 + API 服务
npm run dev:web     # 仅启动 Web 面板
```

### 永久保存环境变量

避免每次开终端重新设置：

```bash
# macOS / Linux — 添加到 ~/.zshrc 或 ~/.bashrc
export LLM_UPSTREAM_URL=https://api.anthropic.com
```

```powershell
# Windows PowerShell — 永久写入用户环境变量
[System.Environment]::SetEnvironmentVariable("LLM_UPSTREAM_URL", "https://api.anthropic.com", "User")
```

### 数据存储

所有数据存储在 `proxy/data/traces.db`（SQLite），已加入 `.gitignore`，重启服务后历史数据保留。
