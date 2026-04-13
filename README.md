# LLM Router — 流量追踪工具

透明代理，拦截 AI 编程助手发往 LLM API 的所有请求，在 Web 面板中实时可视化分析，agent 无感知。

```
Code Agent  →  localhost:7878  →  LLM API（你的 Key、你的模型）
                    ↓
             localhost:3000  （实时 Web 面板）
```

## 前置条件

- [Node.js](https://nodejs.org/) 18+
- 一个 LLM API 地址（Anthropic、OpenAI 或任何兼容接口）

## 快速开始

### 1. 安装依赖

```bash
npm install && npm run install:all
```

### 2. 设置上游 API 地址

**启动代理前**必须先设置此环境变量。

**macOS / Linux**
```bash
export LLM_UPSTREAM_URL=https://api.anthropic.com
```

**Windows（命令提示符）**
```cmd
set LLM_UPSTREAM_URL=https://api.anthropic.com
```

**Windows（PowerShell）**
```powershell
$env:LLM_UPSTREAM_URL = "https://api.anthropic.com"
```

### 3. 启动

```bash
npm run dev
```

浏览器打开 **http://localhost:3000**，agent 发出请求后面板会立即显示。

## 配置你的 Code Agent

将 agent 的 base URL 改为 `http://localhost:7878`，API Key 和其他配置保持不变，代理会原样透传所有请求头。

### Claude Code

**macOS / Linux**
```bash
export ANTHROPIC_BASE_URL=http://localhost:7878
export ANTHROPIC_API_KEY=sk-ant-...
claude
```

**Windows（命令提示符）**
```cmd
set ANTHROPIC_BASE_URL=http://localhost:7878
set ANTHROPIC_API_KEY=sk-ant-...
claude
```

**Windows（PowerShell）**
```powershell
$env:ANTHROPIC_BASE_URL = "http://localhost:7878"
$env:ANTHROPIC_API_KEY  = "sk-ant-..."
claude
```

### OpenAI 兼容 agent（Cursor、Cline 等）

在 agent 设置中将 base URL 改为 `http://localhost:7878`。代理根据 agent 实际调用的请求路径自动识别协议，无需额外配置：

| 路径 | 协议 |
|---|---|
| `/v1/messages` | Anthropic |
| `/v1/chat/completions` | OpenAI |

其他路径透明转发，不记录追踪。

## Web 面板功能

通过 SSE 实时推送，无需轮询或刷新页面。

| 列 | 内容 |
|---|---|
| **会话列表** | 按协议分组，颜色标注，支持删除/清空 |
| **Trace 列表** | 该会话内每条请求，含状态码、耗时、Token 数 |
| **详情** | Messages · Response · JSON · Headers · Tokens 标签页 |

**Messages** 标签完整渲染对话内容，包括 system prompt、tool call、tool result。**Response** 标签渲染助手回复，tool call 可视化展示。

## 端口说明

| 服务 | 端口 |
|---|---|
| 代理（Anthropic + OpenAI） | 7878 |
| Web 面板 | 3000 |
| 内部 API | 3001 |

## 单独启动

```bash
npm run dev:proxy   # 仅启动代理和 API 服务
npm run dev:web     # 仅启动 Web 面板
```

## 永久保存环境变量（可选）

避免每次开终端都要重新设置：

**macOS / Linux** — 添加到 `~/.zshrc` 或 `~/.bashrc`：
```bash
export LLM_UPSTREAM_URL=https://api.anthropic.com
```

**Windows** — 通过「系统属性 → 环境变量」永久设置，或在 PowerShell 中运行：
```powershell
[System.Environment]::SetEnvironmentVariable("LLM_UPSTREAM_URL", "https://api.anthropic.com", "User")
```
