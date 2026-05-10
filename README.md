# March CLI

终端原生编码 Agent，基于 10 层上下文重建引擎和 nocturne 记忆系统。

## 环境要求

- Node.js 22+
- Provider 凭证：
  - API key：在项目根目录 `.env` 或 `~/.march/.env` 中设置 `DEEPSEEK_API_KEY`、`OPENAI_API_KEY`、`ANTHROPIC_API_KEY`；其他 provider 使用 `<PROVIDER>_API_KEY`，例如 `OPENAI_CODEX_API_KEY`
  - OAuth：支持的 provider 可用 `march login <provider>` 登录，凭证保存到用户级 `~/.march/auth.json`

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

# OpenAI Codex OAuth 登录后启动
node .\march-cli\bin\march.mjs login openai-codex
node .\march-cli\bin\march.mjs --provider openai-codex --model gpt-5.4

# 交互式 PTY shell 默认可用，进入 REPL 后可用 /shell spawn 启动 shell
node .\march-cli\bin\march.mjs

# 启动并写出完整上下文快照
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
| `--provider <name>` | AI provider，常用 `deepseek`、`openai`、`anthropic`、`openai-codex`；自定义 provider 默认读取 `<PROVIDER>_API_KEY` |
| `--resume <id>` | 恢复之前的 session |
| `--json` | JSON 输出模式（无 TUI） |
| `--dump-context` | 每轮前将上下文快照写入 `.march/context-snapshot.txt` |
| `--legacy-sessions` | 使用旧 `.march/sessions` 启动和命令语义 |
| `--pi-sessions` | 强制使用 pi JSONL SessionManager 持久化 |
| `--pi-runtime-host` | 强制使用 pi AgentSessionRuntime host 路径 |
| `--pi-session-defaults` | 默认 pi session 模式的兼容别名 |
| `--shell-runtime` | 启用交互式 PTY shell tools、`/shell` 命令和 TUI 右侧 shell pane（默认已启用，兼容旧用法） |
| `--no-shell-runtime` | 禁用交互式 PTY shell tools、`/shell` 命令和 TUI 右侧 shell pane |
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
| `/shell`、`/shell <id-or-name>`、`/shell spawn [name]` | 查看 shell、显示当前 screen 输出或启动默认 PTY shell |
| `/save` | 显示默认 pi session 自动保存状态；legacy 模式下手动保存 |
| `/pin <path>` | 钉文件 |
| `/unpin <path>` | 解钉 |
| `/pins` | 列出已钉文件 |
| `/exit` | 保存并退出 |

## 快捷键

默认快捷键可通过项目 `.march/keybindings.json` 覆盖，支持的按键格式包括 `Esc`、`Shift+Tab`、`Ctrl+<A-Z>` 和 `Alt+<A-Z>`。当前默认值：

| 快捷键 | 说明 |
|---|---|
| `Esc` | 中止当前 turn；等待 retry 时取消等待 |
| `Ctrl+C` | 中止当前 turn；空闲时退出 |
| `Shift+Tab` | 快速循环 thinking level |
| `Ctrl+T` | 打开 thinking selector |
| `Ctrl+L` | 打开 model selector |
| `Ctrl+G` | 打开外部编辑器（`$VISUAL` 或 `$EDITOR`） |
| `Ctrl+O` | 折叠/展开工具输出 |
| `Alt+V` | 粘贴剪贴板图片，保存到 `.march/attachments/<session-id>/` 并插入 `@.march/attachments/...` marker |
| `Alt+S` | 打开/关闭右侧 shell pane |
| `Alt+N` | shell pane 内切到下一个 shell |
| `Alt+K` / `Alt+J` | shell pane 上下滚动 |

## 配置

配置按顺序合并，后者覆盖前者的标量值，`skills` 和 `pins` 会去重追加：

1. `~/.march/config`
2. 项目根目录 `.marchrc`
3. 项目根目录 `.march/config`

`/settings` 命令会写入 `~/.march/config` 或 `.march/config`。配置文件是 JSON：

```json
{
  "provider": "deepseek",
  "model": "deepseek-v4-pro",
  "skills": [],
  "pins": []
}
```

## 核心概念

### 上下文分层引擎

每轮从项目事实重建上下文，不会腐烂。10 层结构：

`[system_core]` → `[injections]` → `[session_status]` → `[memory]` → `[active_skills]` → `[open_files]` → `[tools]` → `[runtime_status]` → `[recent_chat]`

运行 `node .\march-cli\bin\march.mjs --dump-context` 可看到完整快照。该命令会启动 March runtime 并检查 provider API key；不输入 prompt 时只写启动期上下文快照，不发起模型 turn。

### 记忆系统

移植自 nocturne 的 4 实体图记忆，绑定到项目 `.march/memory.db`（SQLite）。

- Agent 通过 `create_memory` / `read_memory` 等工具存取
- `project://boot/` 下的记忆在首轮自动注入上下文
- 关键词通过 glossary 匹配触发回忆

### 技能系统

技能是 `.md` 文件，放在两个目录：

- `~/.march/skills/` — 全局技能
- `.march/skills/` — 项目技能（同名覆盖全局）

支持 `.march/skills/<name>/SKILL.md` 或扁平 `.md` 文件。通过 `--skill` 参数、`/skill:name` 输入前缀或 Agent 主动调用 `activate_skill` 激活。

### 文件追踪

Agent 通过 `open_file` 将文件加入工作集，`[open_files]` 层会在每轮上下文重建时内联文件内容（含行号）。`edit_file` 支持行号区间编辑，不需要复制原文。

### Turn 纪律

每轮完成后，March 会把会话状态、上下文摘要和 pi sidecar 同步到项目 `.march/` 下，供后续 resume、clone、fork 和上下文重建使用。

### Auth 存储

March 会先加载项目根目录 `.env`，再加载 `~/.march/.env`，并把匹配的 API key 注入 provider auth。OAuth 登录使用 `march login <provider>`，例如 `march login openai-codex`。登录得到的凭证保存在用户级 `~/.march/auth.json`，不写入项目 `.march/`。

## Troubleshooting

### 真实验收脚本

常规 `npm test` 只跑稳定 smoke。涉及真实 PTY/TUI 的验收脚本需要手动运行，运行前建议清空 Node inspector 环境变量，避免 `Debugger listening` 挂住验收进程：

```powershell
cd march-cli
$env:NODE_OPTIONS=""
$env:VSCODE_INSPECTOR_OPTIONS=""
npm run test:real
```

也可以按覆盖范围单独运行：

```powershell
npm run test:shell-runtime-real
npm run test:shell-tui-real
npm run test:tui-key-real
```

| 脚本 | 覆盖 |
|---|---|
| `test:real` | 顺序运行全部真实 PTY/TUI acceptance |
| `test:shell-runtime-real` | 真实 `node-pty` shell runtime 的启动、输入、快照和自然退出 |
| `test:shell-tui-real` | 真实 March TUI 右侧 shell pane 的 `/shell spawn`、`Alt+S`、shell 输入和 `Ctrl+C` 退出 |
| `test:tui-key-real` | 真实 March TUI 的 `Ctrl+T` selector、`Esc` 取消和空闲 `Ctrl+C` 退出 |

`test:tui-key-real` 失败时会打印最近的验收 trace、清洗后的 PTY 输出和 raw escaped PTY 输出，方便确认终端实际返回了什么按键序列。

### 启动时出现 Debugger listening

如果运行 `node .\march-cli\bin\march.mjs ...` 时先打印 `Debugger listening` / `Debugger attached`，通常是当前 shell 或编辑器注入了 Node inspector 环境变量。March 不需要 inspector 才能运行，可以先清空：

```powershell
$env:NODE_OPTIONS=""
$env:VSCODE_INSPECTOR_OPTIONS=""
node .\march-cli\bin\march.mjs --provider openai-codex --model gpt-5.4
```

`ExperimentalWarning: SQLite is an experimental feature` 来自当前 Node 版本的 SQLite API 提示，不代表 March 启动失败。真正的启动失败会打印明确的 `Error:`，例如缺凭证时提示 `march login <provider>`。

## 目录布局

```
~/.march/                   # 全局状态
  skills/                   # 全局技能池
  .env                      # 全局 API key（可选）
  auth.json                 # OAuth 登录凭证和用户级 auth

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
