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
derived FTS5 tag index
        ↓
memory hint: id + name + short_description
        ↓
memory_open(id) reads Markdown body when needed
```

Markdown 文件是真相：用户可以直接用 Obsidian 打开、编辑、移动或删除。March 不依赖 Obsidian API，只读写文件系统。

FTS5 tag index 是缓存：它服务 March 内部被动召回，不承担长期事实存储。索引错了就重建，不能让索引反过来覆盖 Markdown。

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

March 内部被动召回只索引 tags。

```text
tags
```

`id`、`name`、`description`、`status`、`path` 是元数据，不参与 March 内部被动召回匹配。`description` 是召回后展示给 AI 的自然语言摘要，不应该为了搜索效果写成关键词堆砌文本。

默认不索引正文 body。

原因是 body 往往很长，容易把召回变成全文搜索噪声。被动召回的职责不是回答问题，而是提醒模型“这里可能有一条相关记忆”。如果 AI 需要细节，再调用 `memory_open(id)` 读取原文。

## 被动召回索引

第一版直接使用 SQLite FTS5，但 FTS5 只索引 tags 展开的文本，不索引 name、description 或正文。

```sql
CREATE VIRTUAL TABLE memory_tags_fts USING fts5(
  id UNINDEXED,
  tags_text,
  tokenize = 'unicode61'
);
```

普通 metadata 表保存展示和同步所需字段：

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

写入 FTS5 前，March 会把层级 tags 展开成适合匹配的 `tags_text`。

例子：

```yaml
tags:
  - memory/memory-hint
  - memory/dedup
  - context/cache
  - project/march-cli
```

展开成：

```text
memory/memory-hint memory memory hint
memory/dedup memory dedup
context/cache context cache
project/march-cli project march cli
```

中文 tag 也按同样原则显式展开：

```yaml
tags:
  - 记忆/被动召回
  - 记忆/去重
```

展开成：

```text
记忆/被动召回 记忆 被动召回
记忆/去重 记忆 去重
```

这样中文不需要依赖复杂分词。tag 本身就是用户整理过的概念词，March 只需要匹配这些显式概念。

## 被动召回匹配

March 内部被动召回查询 FTS5 的 `tags_text`。它不是语义搜索，也不是全文搜索。

打分来源：

```text
tag exact match        高权重
tag partial match      中高权重
current project tag    小幅加分，不硬过滤
```

一个简单可落地的打分模型：

```text
score =
  tagExactMatch * 10
+ tagPartialMatch * 5
+ currentProjectTagMatch * 2
```

查询策略：

```text
用户消息 / assistant output
  ↓
从当前 tag dictionary 里反向匹配已知 tag phrase 和 tag segment
  ↓
生成 FTS5 tags query
  ↓
memory_tags_fts MATCH query
```

这里的 tag dictionary 来自已索引记忆的 frontmatter。March 先扫描所有 memory tags，展开成概念词表；用户消息或 assistant output 只有命中这些已知 tag 词时，才会触发 FTS5 查询。

没有命中 tag 时，March 不做被动召回。这是有意设计：被动召回宁可漏掉，也不要误召回。AI 如果觉得需要更宽的搜索，可以主动调用 `memory_search`，该工具背后使用 ripgrep 搜索 Markdown 全文。

召回流程：

```text
query = user message or assistant output
        ↓
normalize + tokenize
        ↓
match tags_text via FTS5
        ↓
weighted score
        ↓
filter status = active
        ↓
boost current project tags, but do not filter other projects
        ↓
apply recall dedup rules
        ↓
return top hints
```

这个算法的好处是可解释。用户问“为什么召回这条记忆”，March 可以说：命中了哪些 tag。后续如果 tags-only 召回不够，再讨论 embedding 或更复杂的 tag 推荐机制，而不是让 description 变成搜索字段。

## 被动召回

被动召回结果写进 `[recent_chat]` 的消息后面，不作为独立 `[memory]` 层。

用户消息触发：

```text
输入：user message
搜索：FTS5 tag index
数量：最多 3 条
输出：id / name / short_description
位置：user message 后
去重：rolling suppression window，默认最近 10 个用户 turn
```

assistant 输出触发：

```text
输入：assistant model output
搜索：FTS5 tag index
数量：最多 2 条
输出：id / name / short_description
位置：assistant output 后
去重：当前 turn 内去重
```

同一 turn 内还维护 `turnSeenMemoryIds`，避免用户消息召回和 assistant 输出召回重复附加同一条记忆。

上下文展示形态：

```text
[user]
我们继续讨论 memory 召回。

[memory_hint source="user"]
- mem_01hx_context_cache | Context cache ordering | 高频变化层不能放在大块稳定上下文前面
- mem_01hx_recall_dedup | Passive recall dedup | 用户召回按最近 10 个 turn 做滚动抑制

[assistant]
这里要分用户触发和 assistant 输出触发两种召回...

[memory_hint source="assistant"]
- mem_01hx_turn_seen | Turn seen set | 同一 turn 内 user/assistant recall 不重复
```

## 主动回忆工具

工具集保持小而清楚。

```text
memory_search(query, limit?)
memory_open(id)
memory_save(id?, name, description, body, tags?)
```

`memory_search` 用于 AI 主动回忆，背后使用 ripgrep 搜索 `March Memories/` 里的 Markdown 文件全文。它返回匹配文件、行号和上下文片段。工具描述里必须明确告诉 AI：这是 ripgrep 文本搜索，不是语义搜索，也不是 March 内部 tags-only 被动召回。

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

索引同步的原则是：Markdown 文件永远是事实源，FTS5 tag index 永远可以重建。

```text
Markdown files
        ↓
scan / watch
        ↓
derived FTS5 tag index
        ↓
memory hint
```

AI 工具层的 `memory_search` 使用 ripgrep 直接搜索 Markdown 文件，不依赖 FTS5 tag index。即使 FTS5 index 暂时过期，主动 ripgrep 搜索也能看到文件系统上的当前内容。

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

每次 search 或 memory hint 前，March 保证索引不是明显过期的。

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
不参与 memory hint
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
memory hint 只给线索
memory_open 才读原文
```
