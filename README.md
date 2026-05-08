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

```bash
# 单次执行
node src/main.mjs "把这个函数的变量名改成有意义的英文"

# 交互式 REPL
node src/main.mjs

# 查看完整上下文快照（不调 API）
node src/main.mjs --dump-context
```

## 命令行参数

| 参数 | 说明 |
|---|---|
| `-m, --model <id>` | 模型 ID，默认 `deepseek-v4-pro` |
| `--resume <id>` | 恢复之前的 session |
| `--json` | JSON 输出模式（无 TUI） |
| `--dump-context` | 每轮前将上下文快照写入 `.march/context-snapshot.txt` |
| `--pin <path>` | 将文件钉入上下文（可重复） |
| `--skill <name>` | 激活技能（可重复） |
| `-h, --help` | 帮助 |

## REPL 命令

| 命令 | 说明 |
|---|---|
| `/help` | 命令列表 |
| `/status` | 当前 session、模型、轮次、打开的文件 |
| `/sessions` | 已保存的 session 列表 |
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

运行 `node src/main.mjs --dump-context` 可看到完整快照。

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

Agent 通过 `open_file` 将文件加入工作集，`[open_files]` 层会实时内联文件内容（含行号）。文件变动后 watcher 自动刷新。`edit_file` 支持行号区间编辑——不需要复制原文。

### Turn 纪律

每轮结束时 Agent 必须调用 `send_turn_summary`，总结本轮做了什么。摘要以 `<WorkSummary>` 标签注入 `[recent_chat]`。

## 目录布局

```
~/.march/                   # 全局状态
  skills/                   # 全局技能池
  .env                      # 全局 API key（可选）

.march/                     # 项目状态
  skills/                   # 项目技能池
  memory.db                 # SQLite 记忆数据库
  sessions/                 # Session 持久化
  context-snapshot.txt      # --dump-context 输出
```
