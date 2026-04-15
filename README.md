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
- **Token 趋势图**：Trace 列表上方实时 Sparkline，展示 main_agent token 增长曲线，上下文压缩点以橙色虚线高亮
- **上下文使用率**：每条 trace 底部进度条 + 详情面板百分比，颜色随使用率动态变化（绿→黄→橙→红），阈值和模型窗口大小均可在设置中自定义
- **上下文压缩检测**：选中两条 trace 对比 messages diff，判断是否发生了 context compression
- **完整请求还原**：Messages、Response、Raw Request、Raw Response、Headers 全部可查
- **Anthropic + OpenAI 双协议**：根据请求路径自动识别，其余路径透明转发不记录
- **备注系统**：Session / Run / Trace 三级备注，持久化存储，方便事后分析

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

## URL 配置说明

代理的 URL 转发规则极简：**将 agent 请求中的 `http://localhost:7878` 直接替换为 `LLM_UPSTREAM_URL`**，路径原样透传，不做任何增删。

```
agent → http://localhost:7878{path}
proxy → LLM_UPSTREAM_URL + {path}
```

因此两个地址的配置关系为：

| 配置项 | 填写内容 |
|---|---|
| agent 的 base URL | `http://localhost:7878`（固定，替代原来的上游地址） |
| `LLM_UPSTREAM_URL` | 原来在 agent 里填的上游 base URL |

**示例：** 原先 agent 配置为 `https://api.openbitfun.com/v1`，接入代理后：

```bash
# agent 改为指向代理
export ANTHROPIC_BASE_URL=http://localhost:7878

# 代理指向原上游（填原来 agent 里的地址）
export LLM_UPSTREAM_URL=https://api.openbitfun.com/v1
```

路径流：agent 发 `/messages` → 代理拼接 → `https://api.openbitfun.com/v1/messages`，与直连结果完全一致。

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
  - Anthropic 协议的 input token 已自动合并 `input_tokens`、`cache_creation_input_tokens`、`cache_read_input_tokens` 三个字段
  - 输入 token 数字颜色随上下文使用率变化（绿→黄→橙→红）
- 使用的模型名称
- 每行底部 2 px 进度条显示该请求占用的上下文窗口百分比

列表顶部支持按类型多选过滤，仅展示需要的流量。

#### Token 趋势图（Sparkline）

Trace 列表上方实时显示当前 run/session 中所有 main_agent 请求的 token 增长折线图：

- 蓝色折线：正常 token 增长
- 橙色虚线：token 数下降（上下文压缩发生点）
- 鼠标悬停查看 token 数与模型名称；点击直接跳转到该 trace 并自动滚动列表定位
- 当前选中的 trace 显示蓝色圆圈，锁定的基准 trace 显示橙色圆圈

可在设置中关闭该图表。

### 详情面板

顶部 meta 区域显示 agent 类型、时间、模型、耗时、token 数，以及输入 token 的上下文使用率进度条（bar + 百分比）。

| 标签 | 内容 |
|---|---|
| Messages | 完整渲染对话内容，含 system prompt、tool call、tool result |
| Response | 助手回复渲染，Anthropic cache token 分项展示 |
| Raw Request | 原始请求体 JSON |
| Raw Response | 原始响应体 JSON |
| Headers | 请求与响应 header |
| Diff | 两条 trace 的 messages 差异对比（见下方说明） |

所有标签页右上角均提供**三态展开控制**：

| 按钮 | 效果 |
|---|---|
| 折叠 | JSON/tool 内容收起至第 1 层，方便快速浏览结构 |
| 默认 | 展开至第 3 层（默认） |
| 展开 | 全部展开，配合 Ctrl/Cmd+F 全文检索 |

详情面板 header 右侧有**导出 messages** 按钮，可将当前 trace 的 messages 导出为 OpenAI Chat 兼容的 JSON 文件，便于离线分析。

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

## 备注系统

Session、Run、Trace 三个层级均支持添加研究备注，持久化存储在 SQLite 中，重启后保留。

**使用方式：**

- **Session 备注**：在左侧 Session 列表中点击选中某个 session，底部出现 📝 备注区域
- **Run 备注**：在 Run 列表中点击选中某个 run，底部出现 📝 备注区域
- **Trace 备注**：在右侧详情面板 header 的 token 信息下方，始终可见

点击 📝 图标或「添加备注…」文字展开输入框，**⌘↵**（或 Ctrl+↵）保存，**Esc** 取消。已有备注时显示黄色文字预览。

适合在观测实验过程中随手记录当时的判断，例如「此处发生了压缩」「agent 在此开始重新读文件」，方便事后回溯分析。

---

## 设置

点击 Sessions 列表底部的 **⚙ 设置** 按钮打开设置面板，配置项实时生效，持久化到浏览器 `localStorage`。

| 配置项 | 说明 |
|---|---|
| Token 趋势图 | 开/关 Sparkline 显示 |
| 上下文使用率阈值 | 自定义黄/橙/红三档颜色触发百分比（默认 50% / 75% / 90%） |
| 模型上下文窗口 | 模型名称 pattern → token 上限映射表，按顺序匹配，支持增删；未命中时默认 200 000 |

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
