# Markdown 记忆系统设计

最后更新：2026-05-14

---

## 总判断

March 的新记忆系统采用 Markdown 文件作为事实源。索引只是从 Markdown 派生出来的缓存，可以随时删除重建。

记忆文件只放在全局位置，不放进项目目录。记忆默认属于同一个全局池，不按项目做硬隔离。跨项目召回是有价值的：一个项目里踩过的坑，可能正好能帮另一个项目避开同类问题。

被动召回不注入记忆原文，只在对话消息后附加少量记忆线索。AI 如果需要原文，必须通过主动 memory 工具打开。

## 系统结构

```text
Obsidian Vault / global memory root
        ↓
March Memories/**/*.md
        ↓
parse frontmatter: id / name / description / tags / status
        ↓
derived semantic vector index + metadata cache
        ↓
recall hint: id + score + name + short_description
        ↓
memory_open(id) reads Markdown body when needed
```

## Profiles 与 Memories

Profiles 是每轮固定注入的长期身份/偏好，不属于按需召回记忆。

```text
~/.march/memory/profiles/
├─ agent.md   # Agent Profile: March 如何工作、表达和协作
└─ user.md    # User Profile: 用户偏好、长期目标和稳定事实
```

March 启动时会自动创建缺失的 profile 文件，并在 context 中注入为 `[agent_profile]` 和 `[user_profile]`。

Markdown Memories 是事件型、经验型或项目型记忆，通过 `memory_search` / `memory_open` 按需召回。不要把可检索的历史事件塞进 Profiles；也不要把稳定身份偏好拆成普通 recall hint。

Markdown 文件是真相：用户可以直接用 Obsidian 打开、编辑、移动或删除。March 不依赖 Obsidian API，只读写文件系统。

索引是缓存：semantic vector index 服务 March 内部被动召回，SQLite metadata cache 服务扫描加速；索引错了就重建，不能让索引反过来覆盖 Markdown。

## 存储位置

记忆库优先通过配置指向用户的 Obsidian vault 子目录：

```text
<ObsidianVault>/March Memories/
```

配置项：

```json
{
  "memoryRoot": "/path/to/ObsidianVault/March Memories"
}
```

也可以用环境变量指定：

```text
MARCH_MEMORY_ROOT=/path/to/ObsidianVault/March Memories
```

如果没有配置，March 默认使用自己的用户状态目录：

```text
<MarchUserState>/March Memories/
```

March 只索引这个子目录，不默认索引整个 Obsidian vault。这样可以避免把用户的普通笔记、日记或私人材料误纳入 AI 记忆召回。

项目目录不保存记忆文件。当前项目名称、仓库名或 project id 只作为排序信号使用，不作为召回过滤条件。

如果一条记忆和某个项目强相关，可以用 tag 表达：

```yaml
tags:
  - project/march-cli
  - context
  - cache
```

这些 tags 只影响排序加分。March 不因为记忆没有匹配当前项目 tag 就排除它。

## 目录结构

记忆文件按时间轴分桶，避免单个文件夹里文件过多。

推荐结构：

```text
<ObsidianVault>/March Memories/
└─ 2026/
   └─ 05/
      └─ week2/
         ├─ 2026-05-14-writing-style.md
         ├─ 2026-05-14-context-cache-ordering.md
         └─ 2026-05-14-prefix-cache.md
```

月内按 7 天分桶：`01-07 -> week1`，`08-14 -> week2`，`15-21 -> week3`，`22-28 -> week4`，`29-31 -> week5`。

文件名用于人工浏览，不作为稳定引用。稳定引用只依赖 frontmatter 里的 `id`。

推荐文件名：

```text
YYYY-MM-DD-slug.md
```

## Markdown 格式

每条记忆是一个 Markdown 文件。

```markdown
---
id: mem_01hx_context_cache
name: Context cache ordering
description: 高频变化层不能放在大块稳定上下文前面，否则会污染 prefix cache
tags:
  - march/context
  - cache
  - architecture
status: active
created_at: 2026-05-14T10:30:00.000Z
updated_at: 2026-05-14T10:30:00.000Z
---

# Context cache ordering

这里是记忆原文。默认不进入被动召回。
```

核心字段：

```text
id                 稳定引用，memory_open(id) 使用
name               人类可读短名
description        被动召回展示的短描述，不参与索引
tags               召回和人工整理用的标签
status             active / deprecated
body               记忆原文，默认不参与被动召回
```

严格规则：

```text
没有 id 的文件不进入索引
没有 description 的文件不参与被动召回
status != active 的文件默认不参与搜索和召回
```

这样做是为了减少误召回。普通 Obsidian 笔记可以存在，但只有被明确整理成 memory 格式的文件才会进入 March 记忆系统。

## 索引源

March 内部被动召回索引轻量 metadata 和正文分块：

```text
name + description + tags + body section
```

`id`、`status`、`path` 是元数据，不参与语义匹配。`description` 仍然是给 AI 和用户看的自然语言摘要，不应该为了搜索效果写成关键词堆砌文本。

body 会按段落切成有限长度 chunk。被动召回仍只返回 hint，不直接注入正文；如果 AI 需要细节，再调用 `memory_open(id)` 读取原文。

## 被动召回索引

被动召回使用本地 semantic vector index。索引不写回 Markdown；当 memory 文件的 path、mtime 或 size 变化时，向量索引会按当前 active memory 重新构建。

普通 SQLite metadata 表只保存扫描缓存和同步所需字段：

```sql
CREATE TABLE memory_index (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  status TEXT NOT NULL,
  mtime_ms INTEGER NOT NULL,
  size INTEGER NOT NULL
);
```

语义 chunk 形态：

```text
entry.name
entry.description
entry.tags.join(" ")
body section
```

这样 tags、摘要和正文经验都能参与匹配，但最终注入仍保持为短 hint。

## 被动召回匹配

March 内部被动召回统一查询 semantic vector index。`user` 和 `assistant` 只是触发时机，不对应不同匹配算法。

打分来源：

```text
query embedding ↔ memory chunk embedding
        ↓
cosine similarity
        ↓
min score threshold
```

默认阈值是 `0.5`，可用 `MARCH_MEMORY_RECALL_MIN_SCORE` 覆盖。

查询策略：
```text
用户消息 / assistant output
  ↓
encode query
  ↓
search memory chunks: name + description + tags + body section
  ↓
filter status = active
  ↓
apply recall dedup rules
  ↓
return top hints with score=0.xx
```

这个算法的边界是：被动召回只返回轻量 hint，不注入 memory 原文；AI 如果需要原文，必须主动调用 `memory_open`。

## 被动召回

被动召回结果写进 `[recent_chat]` 的消息后面，不作为独立 `[memory]` 层。

用户消息触发：

```text
输入：user message
搜索：semantic vector index
数量：最多 3 条
输出：id / score / name / short_description
位置：user message 后
去重：rolling suppression window，默认最近 10 个用户 turn
```

assistant 输出触发：

```text
输入：assistant model output
搜索：semantic vector index
注入：最多 2 条过阈值 memory
UI：无论是否过阈值，轻量显示最多 3 条候选；不展示 description
位置：turn 内下一次 model call 的 messages 末尾；turn 结束后的结果只进入下一轮 rebuild 的 recent_chat
去重：当前 turn 内去重
```

同一 turn 内还维护 `turnSeenMemoryIds`，避免用户消息召回和 assistant 输出召回重复附加同一条记忆。

上下文展示形态：

```text
[user]
我们继续讨论 memory 召回。

[recall]
- mem_01hx_context_cache | score=0.62 | Context cache ordering | 高频变化层不能放在大块稳定上下文前面
- mem_01hx_recall_dedup | score=0.57 | Passive recall dedup | 用户召回按最近 turn 做滚动抑制

[assistant]
这里的 user/assistant 只是触发时机，匹配方式统一走向量检索...

[recall]
- mem_01hx_turn_seen | score=0.59 | Turn seen set | 同一 turn 内 user/assistant recall 不重复
```

## 主动回忆工具

工具集保持小而清楚。

```text
memory_search(query, limit?)
memory_open(id)
memory_save(id?, name, description, body, tags?)
```

`memory_search` 用于 AI 主动回忆，背后使用 ripgrep 搜索 `March Memories/` 里的 Markdown 文件全文。它返回匹配文件、行号和上下文片段。工具描述里必须明确告诉 AI：这是 ripgrep 文本搜索，不是 March 内部被动语义召回。

`memory_open` 用 id 打开 Markdown 原文。被动召回只给 id、name、description；AI 想要原文必须显式调用这个工具。

`memory_save` 用于新建或更新 Markdown 记忆文件。它负责写 frontmatter、更新时间戳，并触发索引刷新。

因为被动召回只依赖 tags，新建 memory 时 `tags` 必填，且至少包含 1 个有效 tag。更新已有 memory 时，未传字段保持原值；传入 `tags` 时整体替换旧 tags。AI 可以通过 `memory_save({ id, tags: [...] })` 给已有记忆补充或修正 tags。

March 对 tags 做轻量规范化：

```text
trim 空白
去重
英文统一小写
空格转 -
允许中文
允许 / - _
空字符串无效
```

第一版不提供单独的 tag 增删工具。`memory_save` 覆盖 tags 的语义更简单，也避免工具数量过多。以后如果频繁需要增量改 tag，再考虑增加 `memory_tag(id, add?, remove?)`。

暂不提供 `memory_list`。记忆系统应该以召回和搜索为主，而不是让 AI 浏览全部记忆。

暂不提供 `memory_archive`。废弃通过 frontmatter 表达：

```yaml
status: deprecated
```

搜索和被动召回默认排除 deprecated 记忆。

## 索引同步

索引同步的原则是：Markdown 文件永远是事实源，metadata cache 和 semantic vector index 都可以重建。

```text
Markdown files
        ↓
scan / watch
        ↓
metadata cache + semantic vector index
        ↓
recall hint
```

AI 工具层的 `memory_search` 使用 ripgrep 直接搜索 Markdown 文件，不依赖被动召回索引。即使 semantic index 暂时过期，主动 ripgrep 搜索也能看到文件系统上的当前内容。

不能只依赖文件 watcher。Obsidian、同步盘、git pull、系统休眠都可能让 watcher 漏事件。所以同步要用三层机制：

```text
启动时全量轻扫描
运行时 watcher 增量更新
搜索前节流 dirty check
```

## 全量轻扫描

启动时扫描：

```text
scan March Memories/**/*.md
  ↓
for each file:
  stat path
  if path known and mtime/size unchanged:
    skip parsing
  else:
    parse frontmatter
    update index

for indexed paths not seen:
  remove from index
```

绝大多数文件只需要 `stat`，不需要读正文，所以即使记忆库变大，启动成本也可控。

## 运行时 watcher

watcher 负责快速响应外部修改：

```text
file changed      → 重新 parse 该文件 frontmatter
file created      → 加入 index
file deleted      → 从 index 删除
file renamed      → 旧 path 删除 + 新 path 创建
```

移动文件时，如果新文件 frontmatter 里还是同一个 `id`，March 更新该 id 的 path。这样用户在 Obsidian 里移动文件不会破坏 `memory_open(id)`。

## 搜索前 dirty check

每次 search 或 recall 前，March 保证索引不是明显过期的。

可以用节流策略：

```text
if lastScanAge < 5s:
  use current index
else:
  run lightweight stat scan
```

这让用户刚在 Obsidian 里改完文件时，March 很快能看到变化；同时避免每次模型调用都全量读文件。

## 索引记录

索引条目至少包含：

```ts
MemoryIndexEntry {
  id: string
  path: string
  name: string
  description: string
  tags: string[]
  status: "active" | "deprecated"
  createdAt?: string
  updatedAt?: string
  mtimeMs: number
  size: number
  contentHash?: string
}
```

`mtimeMs + size` 用来快速判断文件是否可能变了。`contentHash` 可选，但建议在文件被读取时计算，用来确认内容是否真的变化。

## 外部修改规则

外部更新：

```text
mtime/size/hash changed → 重新 parse frontmatter → 更新 index
```

外部删除：

```text
indexed path 不存在 → 删除 index entry
memory_open(id) → not found
```

外部移动：

```text
旧 path 不存在，新 path 出现，id 相同 → 更新 path
```

外部改 id：

```text
旧 id 删除，新 id 创建
```

重复 id：

```text
同一个 id 出现在多个文件 → 标记 conflict
搜索默认排除冲突项
memory_open(id) 返回冲突列表，让用户修正
```

缺 id：

```text
不进入 index
```

缺 description：

```text
可以进入 diagnostics
不参与 recall hint
```

## Obsidian 兼容性

March 只要求标准 Markdown + YAML frontmatter。用户可以在 Obsidian 里直接：

```text
阅读记忆
编辑 description 和 tags
移动文件
删除文件
使用 Obsidian 搜索和反链
```

March 不依赖 Obsidian 插件，也不要求 Obsidian 正在运行。

为了避免污染用户普通笔记，March 默认只扫描 `March Memories/` 子目录。后续如果要支持 whole-vault，应作为显式高级选项，而不是默认行为。

## 与现有 memory 系统的关系

现有 memory 系统可以参考这些概念：

```text
glossary keywords   → tags / aliases / triggers
search_documents    → derived index
access_log          → recall/open 日志
system views        → diagnostics / index health
```

不继续沿用这些作为核心真相：

```text
nodes / edges
SQLite memories 表
独立 [memory] 上下文层
自动注入记忆原文
```

新系统的核心边界是：

```text
Markdown 是真相
index 是缓存
recall hint 只给线索
memory_open 才读原文
```
