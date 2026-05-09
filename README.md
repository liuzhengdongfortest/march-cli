# March CLI

终端原生编码 Agent，基于 10 层上下文重建引擎和 nocturne 记忆系统。

## 环境要求

- Node.js 22+
- DeepSeek API key（在项目根目录 `.env` 中设置 `deepseek_api_key=sk-...`）

## 安装

```bash
cd march-cli
npm install
```

## 快速开始

从仓库根目录启动时，CLI 会读取根目录 `.env`：

```powershell
# 单次执行
node .\march-cli\bin\march.mjs "把这个函数的变量名改成有意义的英文"

# 交互式 TUI
node .\march-cli\bin\march.mjs

# 查看完整上下文快照（不调 API）
node .\march-cli\bin\march.mjs --dump-context
```

从 `march-cli/` 目录内开发时也可以使用：

```bash
npm run dev
npm run context
```

## 命令行参数

| 参数 | 说明 |
|---|---|
| `-m, --model <id>` | 模型 ID，默认 `deepseek-v4-pro` |
| `--provider <name>` | AI provider，支持 `deepseek`、`openai`、`anthropic` |
| `--resume <id>` | 恢复之前的 session |
| `--json` | JSON 输出模式（无 TUI） |
| `--dump-context` | 每轮前将上下文快照写入 `.march/context-snapshot.txt` |
| `--legacy-sessions` | 使用旧 `.march/sessions` 启动和命令语义 |
| `--pi-sessions` | 强制使用 pi JSONL SessionManager 持久化 |
| `--pi-runtime-host` | 强制使用 pi AgentSessionRuntime host 路径 |
| `--pi-session-defaults` | 默认 pi session 模式的兼容别名 |
| `--pin <path>` | 将文件钉入上下文（可重复） |
| `--skill <name>` | 激活技能（可重复） |
| `-e, --extension <path>` | 加载 pi extension 路径（可重复） |
| `-h, --help` | 帮助 |

## REPL 命令

| 命令 | 说明 |
|---|---|
| `/help` | 命令列表 |
| `/status` | 当前 git、session、模型、provider、thinking、token 和扩展摘要 |
| `/settings` | 查看或编辑全局/项目 model、provider 设置 |
| `/extensions` | 查看 extension 路径和 lifecycle diagnostics |
| `/models`、`/model <id|index>` | 查看或切换模型 |
| `/thinking`、`/thinking list`、`/thinking <level|index>` | 切换 thinking level |
| `/sessions`、`/sessions tree` | 默认 pi JSONL session 列表和文件级树 |
| `/sessions legacy`、`/resume-legacy <id>` | 旧 `.march/sessions` 显式入口 |
| `/session entries` | 查看当前 pi session 内可 fork 的 entry |
| `/resume <id>` | 恢复默认 pi session |
| `/clone-pi`、`/fork-pi <entry-id> --reset-context` | pi session clone/fork |
| `/export jsonl`、`/export html`、`/export gist <jsonl|html>` | 导出或分享当前会话 |
| `/copy` | 复制最近一轮 assistant 输出 |
| `/name [name]` | 查看或设置当前会话名称 |
| `/hotkeys` | 快捷键和输入前缀面板 |
| `/save` | 手动保存当前 session |
| `/pin <path>` | 钉文件 |
| `/unpin <path>` | 解钉 |
| `/pins` | 列出已钉文件 |
| `/exit` | 保存并退出 |

## 配置

项目根目录的 `.marchrc`（JSON）：

```json
{
  "model": "deepseek-v4-pro",
  "skills": [],
  "pins": []
}
```

## 核心概念

### 上下文分层引擎

每轮从项目事实重建上下文，不会腐烂。10 层结构：

`[system_core]` → `[injections]` → `[session_status]` → `[memory]` → `[active_skills]` → `[open_files]` → `[tools]` → `[runtime_status]` → `[recent_chat]`

运行 `node .\march-cli\bin\march.mjs --dump-context` 可看到完整快照。

### 记忆系统

移植自 nocturne 的 4 实体图记忆，绑定到项目 `.march/memory.db`（SQLite）。

- Agent 通过 `create_memory` / `read_memory` 等工具存取
- `project://boot/` 下的记忆在首轮自动注入上下文
- 关键词通过 glossary 匹配触发回忆

### 技能系统

技能是 `.md` 文件，放在两个目录：

- `~/.march/skills/` — 全局技能
- `.march/skills/` — 项目技能（同名覆盖全局）

文件第一行 `#` 标题为技能名。通过 `--skill` 参数或 Agent 主动调用 `activate_skill` 激活。

### 文件追踪

Agent 通过 `open_file` 将文件加入工作集，`[open_files]` 层会在每轮上下文重建时内联文件内容（含行号）。`edit_file` 支持行号区间编辑，不需要复制原文。

### Turn 纪律

每轮完成后，March 会把会话状态、上下文摘要和 pi sidecar 同步到项目 `.march/` 下，供后续 resume、clone、fork 和上下文重建使用。

## 目录布局

```
~/.march/                   # 全局状态
  skills/                   # 全局技能池
  .env                      # 全局 API key（可选）

.march/                     # 项目状态
  skills/                   # 项目技能池
  memory.db                 # SQLite 记忆数据库
  pi-sessions/              # 默认 pi JSONL session
  pi-sidecars/              # March ContextEngine 私有状态
  sessions/                 # 旧版 legacy session（显式 --legacy-sessions）
  attachments/              # 图片等会话附件
  exports/                  # JSONL/HTML 导出
  context-snapshot.txt      # --dump-context 输出
```
