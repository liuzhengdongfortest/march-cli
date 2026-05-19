<p align="center">
  <img src="docs/assets/march-banner.png" alt="March CLI banner" width="800">
</p>

<p align="center"><strong>忘记 Skill，拥抱记忆，让你的模型永远工作在甜点区。</strong></p>

<p align="center">
  <a href="https://www.npmjs.com/package/march-cli"><img alt="npm" src="https://img.shields.io/npm/v/march-cli?style=flat-square" /></a>
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zh.md">简体中文</a>
</p>

---

### 安装

```bash
npm install -g march-cli
```

### 为什么省 Token？

March 极端地省 Token。每轮对话结束后，上下文回滚到约 8K——我们**丢弃**模型中间的所有执行过程，只保留两样东西：用户的问题和 AI 的最终回复。

大多数 Agent 系统用压缩、裁剪、检索、摘要来对抗上下文膨胀。March 的答案是：直接扔掉不需要的。

结果：

- **缓存命中率 91%**，单次模型调用几乎不超过 50K
- 上下文不会越聊越大，**不存在上下文腐烂**
- 你的模型永远在甜点区工作，而不是在 100K 的噪音里大海捞针

### 记忆系统

March 内置了记忆系统。你在对话中告诉 March 的任何东西——偏好、项目约定、技术决策——它都能记住。当你再次需要时，March 会在思考过程中**自动召回**相关记忆，你不需要手动检索。

#### 不需要 Skill 文件

Skill 系统的问题是：Skill 文件在一开始就注入了上下文。Skill 多了怎么办？

March 换了一种方式：每条记忆就是一条"潜在的 Skill"，由 March 在需要时动态召回，而不是常驻在上下文里。你聊过的内容就是最好的提示词。

#### 管理记忆

March 在 `~/.march/March Memories/` 目录下以 Markdown 文件存储记忆。你可以直接编辑、删除或新增这些文件，March 会自动感知变化。

### 更多内置能力

**生图**：如果你有 ChatGPT Codex 权限，March 可以直接生图，不需要额外的 API Key 或第三方服务。

**联网搜索**：接入 SuperGrok 后，你配置的**所有模型**都会获得联网搜索能力——March 会派遣 Grok 去搜索，搜索结果注入当前对话。

**更多搜索渠道**：Tavily Search、Brave Search 均已内置。

### 配置

March 通过 `~/.march/config.json`（全局）或 `<project>/.march/config.json`（项目级）配置模型和 provider。支持所有 OpenAI 兼容接口。

```json
{
  "provider": "openai",
  "model": "gpt-5.1"
}
```

自定义 provider、多模型切换等详细配置见 [文档](docs/custom-provider.md)。

### FAQ

#### 和 Claude Code 有什么区别？

March 能力相当，但上下文策略截然不同。Claude Code 尽量保留上下文并用压缩应对膨胀；March 每轮重置上下文——你每次拿到的是干净的 ~8K 上下文，缓存命中率 91%。March 还用内置记忆系统替代了 Skill 文件，记忆按需召回而不是常驻注入。

#### 和 OpenCode 有什么区别？

两者都是开源、终端原生的 Agent。March 的核心差异：极端的 Token 效率（每轮上下文重置）、内置 Markdown 记忆系统（自动召回），以及"记忆应该按需召回、而非像 Skill 一样提前注入"的设计哲学。

### 文档

- [完整文档](docs/) — 配置、上下文管理、记忆系统
- [自定义 Provider](docs/custom-provider.md) — 接入本地模型或第三方 API
- [上下文管理](docs/context-core.md) — March 的上下文架构详解
- [记忆系统](docs/markdown-memory-system.md) — 记忆存储与召回机制


