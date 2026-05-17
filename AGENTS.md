## 设计讨论沟通规则

和用户讨论机制设计时，先用简单结构图讲清楚“现在系统是什么样”和“改完以后会变成什么样”，再给原则和边界。不要先展开代码文件、函数名、测试清单或长实现方案。

### 讨论结构

- 先抓一个主轴，不同时展开多个方向。
- 优先画数据/职责流向图，而不是列文件路径。
- 文件路径尽量少，只在定位现有实现或准备动代码时出现。
- 先说判断和原则，再说落地；实现细节必须服务于前面的原则。

### 文档表达

- 表达和写文档都遵守“少即是多”：只写最重要的判断、原则和边界，其他内容适当补充，不自由发挥。
- 按信息金字塔组织内容：先给总判断，再按同一分类维度拆分；同层内容必须同类，不把不同性质的规则混在一个列表里。

### 工程实现

- 核心机制优先追求“优雅架构”，而不是“最小的局部补丁”：先判断责任边界，再做最小改动。优先级是正确职责边界、代码设计优雅，能够合理得调整系统行为并保持系统的自洽
- 保持功能内聚：代码超过 300 行时，按内聚原则把同一块逻辑拆出；如果新增逻辑在原代码中只有较少接入点，设计时就应拆出，再接回原代码。
- 保持目录边界清晰：单个源码目录直属文件超过 10 个时，按职责边界拆出子目录，不用杂项目录或机械搬运凑数。

### 发布形态

- 发布形态保持源码发布：npm 包带 `bin/` 和 `src/`，资源文件随源码目录一起发布；不优先追求单文件 bundle。


### 编码原则
- 每完成一个功能或修改一个功能都需要提交commit


### 文档阅读限制

- 必须直接读取源文件的全文。，若limit参数必填则填写limit=2000

## 名词定义

- **Turn（用户轮次）**：用户发起一次请求，到 March 完成工具调用、模型调用并给出最终回复的完整处理周期。一个 turn 内可以包含多次 model call。
- **Model call（模型调用）**：March 将当前组装后的上下文发送给模型，并接收一次模型输出的过程。工具调用后继续推理会产生新的 model call。
- **Dialog Entry（对话条目）**：单次 model call 的 payload 中 `messages` 数组里的单个元素，包含 `role` 和 `content`。全称 Dialog Entry，简称 Entry。一个 model call 包含多个 dialog entry，其中 `role=tool` 的 entry 即 tool call。
- **Tool call（工具调用）**：模型请求 March 执行一个工具的动作。tool call 不是 turn，也不是 model call；它通常发生在一次 model call 的输出之后。
- **Context assembly（上下文组装）**：在一次 model call 前，March 从各上下文层读取当前事实并组装 prompt 的过程。
- **Layer（上下文层）**：组成最终 prompt 的独立上下文模块。每个 layer 以 `[name]` 格式的 header 开头，后接该层对应的结构化文本。当前 layers 包括 `system_core`、`injections`、`session_identity`、`project_context`、`workspace_status`、`recent_chat` 六个。Context assembly 按固定顺序将这些 layers 组装为 prompt。
- **Diagnostic（诊断信息）**：编译器、类型检查器、linter 或语言服务器对当前工作区产生的错误、警告和提示，等价于 VS Code Problems 面板里的结构化问题列表。
- **Model-specific system prompt（模型专属系统提示）**：`system_core` 中针对具体 `modelId` 选择的 prompt 文件；用于适配不同模型的行为差异，不按 provider 区分。provider 只负责请求路由、鉴权和 transport，不参与 prompt 选择。
