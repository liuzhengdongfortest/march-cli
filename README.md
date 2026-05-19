# 忘记 Skill，拥抱记忆，让你的模型永远工作在甜点区。

```bash
npm install -g march-cli
```

---

## 为什么省 Token？

March 极端地省 Token。每轮对话结束后，上下文会回滚到约 8K——我们**丢弃**模型中间的所有执行过程，只保留两样东西：用户的问题和 AI 的最终回复。

大多数 Agent 系统用压缩、裁剪、检索、摘要来对抗上下文膨胀。March 的答案是：直接扔掉不需要的。

结果：

- **缓存命中率 91%**，单次模型调用几乎不超过 50K
- 上下文不会越聊越大，**不存在上下文腐烂**
- 你的模型永远在最佳状态工作，而不是在 100K 的噪音里大海捞针

---

## 记忆系统

March 内置了记忆系统。你在对话中告诉 March 的任何东西——偏好、项目约定、技术决策——它都能记住。当你再次需要时，March 会在思考过程中**自动召回**相关记忆，你不需要手动检索。

### 不需要 Skill 文件

Skill 系统的问题是：Skill 文件在一开始就注入了上下文，Skill 多了怎么办？

March 换了一种方式：每条记忆就是一条"潜在的 Skill"，由 March 在需要时动态召回，而不是常驻在上下文里。你聊过的内容就是最好的提示词。

### 管理记忆

March 会在你的 `~/.march/March Memories/` 目录下以 Markdown 文件存储记忆。你可以直接编辑、删除或新增这些文件，March 会自动感知变化。

---

## 更多内置能力

**生图**：如果你有 ChatGPT Pro 订阅，March 可以直接生图，不需要额外的 API Key 或第三方服务。

**联网搜索**：接入 SuperGrok 后，你配置的**所有模型**都会获得联网搜索能力——March 会派遣 Grok 去搜索，搜索结果注入当前对话。

**更多搜索渠道**：Tavily Search、Brave Search 均已内置。

---

## 配置

March 通过 `~/.march/config.json`（全局）或 `<project>/.march/config.json`（项目级）配置模型和 provider。支持所有 OpenAI 兼容接口。

```json
{
  "provider": "openai",
  "model": "gpt-5.1"
}
```

自定义 provider、多模型切换等详细配置见 [文档](docs/custom-provider.md)。

---

## 文档

- [完整文档](docs/) — 配置、上下文管理、记忆系统
- [自定义 Provider](docs/custom-provider.md) — 接入本地模型或第三方 API
- [上下文管理](docs/context-core.md) — March 的上下文架构详解
- [记忆系统](docs/markdown-memory-system.md) — 记忆存储与召回机制
