如今 AI Agent 的各种新概念层出不穷:

- Tools
- MCP
- Skills

许多人都会有这样的疑问: Tools 和 MCP 有什么区别? 我用了 MCP 还需要 Tools 吗? Skills 是取代 MCP 的吗? 本文会从 LLM API 的底层设计开始, 一步步介绍 Tools 和 MCP 的区别, 手动实现一个非常简易的 MCP (简易到你会觉得"就这?"), 最后简单提一下 Skills.

# 几个重要事实

- **大模型是无状态的**, 它对你们的过往对话一点都没有记忆. 每次调用 LLM API, 都是一次全新的请求, 就像换了一个完全陌生的人说话.
- 大模型本身的开发(或许)很难, 需要很强的数学知识. 但是大模型应用开发不难, 做纯工程开发的传统程序员也可以很快上手.
- MCP 和 Skills 都是纯工程层面的设施, 和 AI 毫无关系. 也就是说, 在这两个概念出现以前, 你完全可以自己实现一套类似的机制, 不需要 LLM API 支持.

基于以上几个事实, 本文会选择 Anthropic API 来解释. 因为 OpenAI 的 Responses API 提供了一个叫做 `previous_response_id` 的参数, **很容易误导人以为 LLM 本身有记忆功能**. 但实际上 LLM 是没有记忆的, 这个 `previous_response_id` 并不会给 LLM 使用, 而是 OpenAI 的服务层面的工程设施, 相当于 OpenAI 帮我们存了历史记录, 然后发给 LLM. Conversations API 同理.

相比之下, Anthropic API 就原生了许多, 更容易感受到 LLM API 的本质.

# 技术栈

- TypeScript with Bun (Node.js)
- [@anthropic-ai/sdk](https://github.com/anthropics/anthropic-sdk-typescript)

请注意区分 `@anthropic-ai/sdk` 和 [@anthropic-ai/claude-agent-sdk](https://github.com/anthropics/claude-agent-sdk-typescript). 前者是 Anthropic API 的封装, 本质上是一个 HTTP Client, 封装了大量的调用 API 的方法; 后者是对 Claude Code (Claude CLI) 的封装, 封装了大量调用 `claude` 命令行的方法.

本文会使用 `GLM-4.7-flash` 这个兼容 Anthropic API 的免费模型来节约成本, 毕竟 LLM 应用开发最大的痛点就是每次调试运行都需要花钱.

```typescript
const client = new Anthropic({
  baseURL: 'https://api.z.ai/api/anthropic', // 国际版, 你也可以使用国内版, 国内版认证方式是 apiKey
  authToken: ZAI_API_KEY,
});
```

# Hello World

首先从一个最简单的请求开始:

```typescript
const resp = await client.messages.create({
  max_tokens: 1024,
  messages: [
    {
      role: 'user',
      content: '英国的首都是哪里',
    },
  ],
  model: 'glm-4.7-flash',
});

console.log(resp);
```

Output (省略掉不重要的字段):

```json
{
  "id": "msg_202602151117137d34660397a4418d",
  "type": "message",
  "role": "assistant",
  "model": "glm-4.7-flash",
  "content": [
    {
      "type": "text",
      "text": "英国的首都是**伦敦**（London）。"
    }
  ],
  "stop_reason": "end_turn"
}
```

# 多轮对话

正如上面反复提到的, LLM 是无状态的, 每次调用都像是一个全新的完全陌生的人对话. 想象一下, 如果你要和一个人聊天, 每聊完一句, 对面都会换一个人, 那么对方换的人应该如何继续和你的聊天? 当然就是把你之前的聊天历史全部看一遍. 所以调用 LLM 的时候, 每次都需要**把历史记录全部传过去**.

```typescript
// 用一个 messages 数组来维护历史记录
const messages: MessageParam[] = [
  {
    role: 'user',
    content: '英国的首都是哪里',
  },
];

const resp = await client.messages.create({
  max_tokens: 1024,
  messages,
  model: 'glm-4.7-flash',
});

// 重点: 将 LLM 的第一次回复放到数组里
messages.push({
  role: 'assistant',
  content: resp.content,
});

// 再加入第二次对话内容
messages.push({
  role: 'user',
  content: '介绍一下这个城市的污染情况',
});

console.log(inspect(messages));

const resp2 = await client.messages.create({
  max_tokens: 1024,
  messages,
  model: 'glm-4.7-flash',
});

console.log(resp2);
```

可以看看第二次调用 API 传入的 messages 内容是:

```json
[
  {
    "role": "user",
    "content": "英国的首都是哪里"
  },
  {
    "role": "assistant",
    "content": [
      {
        "type": "text",
        "text": "英国的首都是**伦敦**。"
      }
    ]
  },
  {
    "role": "user",
    "content": "介绍一下这个城市的污染情况"
  }
]
```

而 resp2 成功返回了伦敦的污染情况, 说明 LLM 确实感知到了上一次对话内容的城市是伦敦.

```json
{
  "id": "msg_20260215115536fd125b1bca954cf6",
  "type": "message",
  "role": "assistant",
  "model": "glm-4.7-flash",
  "content": [
    {
      "type": "text",
      "text": "伦敦作为全球国际化大都市和前工业革命中心，其污染历史可以追溯到维多利亚时代，且至今仍是全球空气质量治理的“典型样本”..." // 我手动省略, 减少篇幅, 并非 LLM 省略
    }
  ],
  "stop_reason": "end_turn"
}
```

所以你应该也知道了, 所谓的 context windows, 其实可以简单理解为 `messages` 数组的文本长度, 而不是单条消息的长度.

# Tools

## 原始方法

LLM 就像一个很聪明(虽然有时候会很蠢, 但是我们先假定 LLM 很聪明)的大脑, 但是它只有大脑, 没有眼睛 - 意味着它无法接收外界的信息(除了手动传入的 messages), 比如读一个文件; 没有手 - 意味着它无法做出任何行为, 比如修改一个文件. (可以把 LLM 想象成一个遮住眼睛的霍金).

Tools 就相当于给一个大脑安装了外置眼睛和手. 我们先用最朴素的方式让 LLM 调用工具: 直接在 prompt 里写, 有哪些工具, params 分别是什么, 然后让 LLM 选择一个使用, 并提供 params.

```typescript
const messages: MessageParam[] = [
  {
    role: 'user',
    content: `写一句话介绍中国农历马年.
      你有以下 tools 可以调用:
      1. { name: "write", description: "write content to a file", params: 
        { "content": {"type": "string", description: "content"} },
        { "path": {"type": "string", description: "the path of the file to write"} },
       }

      2. { name: "read", description: "read content of a file", params: 
        { "path": {"type": "string", description: "the path of the file to read"} }
       }

       请你选择一个工具使用, 并且提供正确的 params. 你需要输出一个 JSON
    `,
  },
];
```

Output:

````json
{
  "id": "msg_202602151218464370b8983c6c474d",
  "type": "message",
  "role": "assistant",
  "model": "glm-4.7-flash",
  "content": [
    {
      "type": "text",
      "text": "```json\n{\n  \"tool\": \"write\",\n  \"params\": {\n    \"content\": \"中国农历马年象征着奔腾不息的活力与豪迈，寓意着奋进、自由与驰骋。\",\n    \"path\": \"/马年介绍.txt\"\n  }\n}\n```"
    }
  ],
  "stop_reason": "end_turn"
}
````

可以看到, LLM 做到了选择正确的工具, 提供的参数内容倒是没问题, 但是存在以下几个巨大的问题:

1. 返回的 `text` 本质上是个字符串. 虽然在 prompt 里明确要求了需要返回一个 JSON, 但是 LLM 依然返回了一个 JSON markdown, 而不是纯 JSON 字符串.
2. prompt 并不可靠. LLM 无法做到 100% 遵循 prompt, 尤其是能力比较差的模型, 它可能会输出"好的, 下面是我调用工具的 JSON: xxx". 也就是说, 并不能保证输出一定是一个 JSON markdown.
3. 就算输出是一个 JSON markdown, 我们还需要去解析这个 markdown, 一旦涉及到嵌套, 也就是 params 里也包含反引号, 会更加复杂.
4. 无法保证输出的 JSON 100% 遵循了 prompt 里的格式, 比如我在调用的时候就出现过返回了 `arguments` 字段, 而不是 `params`.

基于以上问题, Tool Use (或者叫 Tool Call, Function Call, 一个意思. Anthropic 的官方术语是 Tool Use) 被内置进了 LLM, **成为了 LLM 自身的一个能力**. 也就是说, 如果一个 LLM 不支持 Tool Use, 那么我们基本是没法在工程层面去做 polyfill, 也就无法实现调用 tool.

## 标准方法

上面的例子, 换标准的 Tool Use 方法:

```typescript
const messages: MessageParam[] = [
  {
    role: 'user',
    content: `写一个关于中国农历马年的一句话介绍, 写入 test.txt 里`,
  },
];

const resp = await client.messages.create({
  max_tokens: 1024,
  messages,
  model: 'glm-4.7-flash',
  tools: [
    {
      name: 'write',
      description: 'write content to a file',
      input_schema: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'content',
          },
          path: {
            type: 'string',
            description: 'the path of the file to write',
          },
        },
      },
    },
    // read 同理, 省略掉
  ],
});
```

Output:

```json
{
  "id": "msg_20260215123307fffbbd1b9fd84652",
  "type": "message",
  "role": "assistant",
  "model": "glm-4.7-flash",
  "content": [
    {
      "type": "text",
      "text": "我来写一句关于中国农历马年的介绍并保存到文件中。"
    },
    {
      "type": "tool_use",
      "id": "call_49f0c1dbe920406192ce9347",
      "name": "write",
      "input": {
        "content": "中国农历马年象征着活力、热情与自由，是充满朝气与拼搏精神的吉祥年份。",
        "path": "test.txt"
      }
    }
  ],
  "stop_reason": "tool_use"
}
```

可以看到这次的 `content` 里多了一个 `tool_use` 的 block, 里面写明了需要调用的 tool 的名字和参数. 这个 block 的类型是结构化的, 也就是说可以 100% 保证格式是正确, 符合预期的 (但是不能保证 100% 有这个 block, 取决于 LLM 的能力, 太蠢的 LLM 可能无法决策到底用哪个 tool). 这样我们就可以根据这个结构化的 `tool_use` block, 去执行对于的函数调用.

## 结果回传

考虑一个场景: 让 LLM 阅读一个文件并分析内容. 经过上面的内容, 你应该知道具体的流程是:

1. User 要求 LLM 阅读某个文件并分析内容, 并且传入 read tool schema
2. LLM 决定使用 read tool, 参数是文件路径
3. User 根据路径读取文件内容, 然后传给 LLM
4. LLM 成功输出分析结果

```typescript
const tools: ToolUnion[] = [
  // 本文省略具体内容, read 和 write 两个 tools
];

const messages: MessageParam[] = [
  {
    role: 'user',
    content: `分析一下 package.json`,
  },
];

// 初始请求
const resp = await client.messages.create({
  max_tokens: 1024,
  messages,
  model: 'glm-4.7-flash',
  tools,
});

// 把 LLM 的第一次返回加入到 messages 里
messages.push({
  role: 'assistant',
  content: resp.content,
});

// 第一次返回大概率会包含 tool_use block
// content 是一个数组, 可能额外包含一个 text, 也可能直接就是一个 tool_use
// content 可能包含多个 tool_use, 用户需要把所有的都调用, 然后根据 tool_use_id 去匹配结果
const toolUseResults: ContentBlockParam[] = [];
for (const block of resp.content) {
  if (block.type === 'tool_use') {
    switch (block.name) {
      case 'read':
        try {
          const content = await readFile(block.input.path, 'utf-8');
          toolUseResults.push({ tool_use_id: block.id, type: 'tool_result', content, is_error: false }); // is_error 告诉 LLM 这个调用是否成功
        } catch (err) {
          toolUseResults.push({
            tool_use_id: block.id,
            type: 'tool_result',
            content: JSON.stringify(err),
            is_error: true,
          });
        }

        break;

      case 'write':
        try {
          await writeFile(block.input.path, block.input.content);

          toolUseResults.push({ tool_use_id: block.id, type: 'tool_result', content: 'success', is_error: false });
        } catch (err) {
          toolUseResults.push({
            tool_use_id: block.id,
            type: 'tool_result',
            content: JSON.stringify(err),
            is_error: true,
          });
        }
        break;
    }
  }
}
// 将 tool use results 传给 LLM
messages.push({ role: 'user', content: toolUseResults });

console.log(inspect(messages));

const resp2 = await client.messages.create({
  max_tokens: 1024,
  messages,
  model: 'glm-4.7-flash',
  tools,
});
console.log(resp2);
```

第二次传给 LLM 的 messages 为:

```json
[
  {
    "role": "user",
    "content": "分析一下 package.json"
  },
  {
    "role": "assistant",
    "content": [
      {
        "type": "text",
        "text": "我来帮你分析 package.json 文件。首先，我需要读取这个文件来查看它的内容。"
      },
      {
        "type": "tool_use",
        "id": "call_eeb390dfe8f345269ff95f42",
        "name": "read",
        "input": {
          "path": "package.json"
        }
      }
    ]
  },
  {
    "role": "user",
    "content": [
      {
        "tool_use_id": "call_eeb390dfe8f345269ff95f42",
        "type": "tool_result",
        "content": "{\n  \"name\": \"gh-scout\",\n  \"module\": \"index.tsx\",\n  \"type\": \"module\",\n  \"private\": true,\n  \"devDependencies\": {\n    \"@types/bun\": \"latest\"\n  },\n  \"peerDependencies\": {\n    \"typescript\": \"^5\"\n  },\n  \"dependencies\": {\n    \"@anthropic-ai/sdk\": \"^0.74.0\"\n  }\n}\n",
        "is_error": false
      }
    ]
  }
]
```

第二次从 LLM 返回的结果为:

````json
{
  "id": "msg_2026021512452122fcf4da65474784",
  "type": "message",
  "role": "assistant",
  "model": "glm-4.7-flash",
  "content": [
    {
      "type": "text",
      "text": "## 📦 `package.json` 文件分析\n\n### 基本信息\n\n| 字段 | 值 | 说明 |\n|------|-----|------|\n| **name** | `\"gh-scout\"` | 项目名称，用于 npm 包标识 |\n| **module** | `\"index.tsx\"` | ES 模块入口文件 |\n| **type** | `\"module\"` | 使用 ES6 模块语法 |\n| **private** | `true` | 标记为私有项目，防止误发布到 npm |\n\n### 依赖管理\n\n#### 🔧 开发依赖 (`devDependencies`)\n```json\n\"@types/bun\": \"latest\"\n```\n- 类型定义包，用于 Bun 运行时的 TypeScript 类型支持\n- `\"latest\"` 表示使用最新版本\n\n#### 🤝 对等依赖 (`peerDependencies`)\n```json\n\"typescript\": \"^5\"\n```\n- **关键点**：`typescript` 被标记为对等依赖\n- 这意味着**项目不直接依赖 TypeScript**，而是期望用户环境中已安装 TypeScript\n- 适用于插件/工具类项目，让用户自己选择 TS 版本\n\n#### ⚡ 运行时依赖 (`dependencies`)\n```json\n\"@anthropic-ai/sdk\": \"^0.74.0\"\n```\n- Anthropic AI 的官方 SDK\n- 版本范围 `^0.74.0` 表示安装 0.74.0 或更高版本（不超过主版本号）\n\n---\n\n### 📝 总结\n\n这是一个**轻量级的 TypeScript 工具项目**（`gh-scout`），主要特点：\n\n1. **无运行时依赖**：除了 Anthropic SDK 外，没有其他运行时依赖\n2. **依赖 TypeScript**：用户自己提供 TS 环境\n3. **使用 Bun**：通过 `@types/bun` 表明使用 Bun 运行环境\n4. **模块化设计**：ES 模块类型，入口为 `index.tsx`\n\n项目看起来是一个与 GitHub 相关的工具（从名字 \"gh-scout\" 推测），可能用于分析或监控 GitHub 相关的操作。"
    }
  ],
  "stop_reason": "end_turn"
}
````

可以看到, LLM 第一次告诉我们需要调用 read tool 来读取文件内容. 我们调用完毕后把结果传给 LLM, LLM 第二次就成功分析出了内容.

插个题外话: 看到这里, 你应该也觉得原生 LLM 的方式实在是太繁琐了.

- messages 要手动维护
- tool_use 要手动解析 LLM 的返回, 手动调用, 然后手动把结果传到 messages 数组里
- 如果 LLM 后续还要调用其他 tools, 还需要手动写一个循环

这正是现在各种 AI Agent 框架的意义, 比如 LangChain, LangGraph, Agno 等, 它们底层其实也都是做这种事情, 和传统领域的框架一样, 把繁琐的步骤都封装好了, 就像写 React 就不需要手动去操作 DOM 一样.

# MCP

上面的方式虽然繁琐, 但也完全覆盖了所有场景了. 任何 tool use 都可以用上面的方式去实现. 那么为什么还需要 MCP 呢?

## MCP 是什么

MCP (model context protocol) 是一个协议, 定义了 MCP Client 和 MCP Server 的通信方式. **MCP 的原理和 AI/LLM 没有任何关系**, 只是定义了 tools/resources/prompt 三种信息的通信格式.

## MCP 解决了什么问题

**假设现在没有 MCP 这个概念.**

众所周知, LLM 非常擅长写文档类的东西, 比如 PR description. 所以现在你想让 LLM 帮你在 github 提一个 PR. 你需要先定义一个 tool:

```typescript
const tools: ToolUnion[] = [
  {
    name: 'github_create_pr',
    description: 'create a PR on github',
    input_schema: {
      type: 'object',
      properties: {
        repo: {
          type: 'string',
          description: 'The repo name. Format: {owner}/{repo_name}',
        },
        source_branch: {
          type: 'string',
          description: 'The source branch name',
        },
        target_branch: {
          type: 'string',
          description: 'The target branch name',
        },
        title: {
          type: 'string',
          description: 'The title of the PR',
        },
        description: {
          type: 'string',
          description: 'The description body of the PR',
        },
      },
    },
  },
];
```

然后实现这个 tool 的调用过程:

```typescript
case 'github_create_pr':
  const { repo, source_branch, target_branch, title, description } = block.input;
  const [owner_name, repo_name] = repo.split('/');

  try {
    // 也可以用 gh cli
    const resp = await fetch(`https://api.github.com/repos/${owner_name}/${repo_name}/pulls`, {
      method: 'post',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: 'Bearer GITHUB_TOKEN',
      },
      body: JSON.stringify({
        title,
        body: description,
        base: source_branch,
        head: target_branch,
      }),
    });

    toolUseResults.push({
      tool_use_id: block.id,
      type: 'tool_result',
      content: await resp.text(),
      is_error: false,
    });
  } catch (err) {
    toolUseResults.push({
      tool_use_id: block.id,
      type: 'tool_result',
      content: JSON.stringify(err),
      is_error: true,
    });
  }
  break;
```

每加一个这样的 tool, 都需要花费大量的精力. 但实际上这些 tools 是高度通用的, 调用 github 是一个很普遍的需求.

此时你可能想到, 那我封装一个 `github_tools` 不就可以了?

于是你行动力拉满, 自己(或者让 AI)封装了一个 `github_tools`, 发布到了 npm 上, 其他用户可以像这样使用你的库:

```typescript
import { tools as githubTools, callTool } from '@arc/github_tools';

const tools = [...myTools, ...githubTools];

for (const block of resp.content) {
  if (block.type === 'tool_use') {
    if (block.name.startsWith('github')) {
      const result = await callTool(block);
    }
  }
}
```

但是此时又有了两个新的问题:

1. 你的新项目使用了 Go/Rust, 用不了 npm 包.
2. 由于 Anthropic API 太贵, 你决定迁移到 DeepSeek API, 但是 DeepSeek 对 Anthropic 的兼容性不是很好(假设), 有些格式不匹配, 导致你的库调用失败.

MCP 的出现就是为了解决上面的问题. **MCP 本质上是把 tools 的定义和执行都外置出去了**. MCP 分为 Client 和 Server, 其中 Server 就是外置出去的部分, 负责 tools 的定义和执行. 而 Client 就是留在 AI 应用的部分, 负责和 Server 通信:

- Hi Server, 告诉我有哪些 tools 可以用?
- Hi Server, 我现在要调用 github_create_pr 这个 tool, 参数是 { xxx }

## 最简易的 MCP 实现

知道了 MCP 的设计思想, 那么我们完全可以写一个最简易的实现:

```typescript
const server = async ({ type, body }: { type: string; body?: any }): Promise<string> => {
  if (type === 'list_tools') {
    return JSON.stringify([
      {
        name: 'github_create_pr',
        description: 'create a PR on github',
        input_schema: {
          type: 'object',
          properties: {
            repo: {
              type: 'string',
              description: 'The repo name. Format: {owner}/{repo_name}',
            },
            source_branch: {
              type: 'string',
              description: 'The source branch name',
            },
            target_branch: {
              type: 'string',
              description: 'The target branch name',
            },
            title: {
              type: 'string',
              description: 'The title of the PR',
            },
            description: {
              type: 'string',
              description: 'The description body of the PR',
            },
          },
        },
      },
    ]);
  }

  if (type === 'call_tool') {
    switch (body.name) {
      case 'github_create_pr':
        const { repo, source_branch, target_branch, title, description } = body.input;
        const [owner_name, repo_name] = repo.split('/');
        try {
          const resp = await fetch(`https://api.github.com/repos/${owner_name}/${repo_name}/pulls`, {
            method: 'post',
            headers: {
              accept: 'application/vnd.github+json',
              authorization: 'Bearer GITHUB_TOKEN',
            },
            body: JSON.stringify({
              title,
              body: description,
              base: source_branch,
              head: target_branch,
            }),
          });
          return await resp.text();
        } catch (err) {
          return JSON.stringify(err);
        }
    }
  }

  return 'Unknown type';
};
```

为了简单起见, 我直接写的是一个函数. 你完全可以将其做成一个 HTTP server, 因为反正这个函数的返回类型是 string, 可以作为 HTTP Response.

然后再写一个 client:

```typescript
class McpClient {
  async listTools() {
    const tools = await server({ type: 'list_tools' });
    return JSON.parse(tools) as ToolUnion[];
  }

  async callTool(name: string, params: any) {
    const res = await server({ type: 'call_tool', body: params });
    return res;
  }
}
```

发现了吗? 上面的代码和 LLM 一点关系都没有, 这也是我一直在强调的重点: MCP 是工程设计, 不是 LLM 自身能力. **你完全可以脱离 AI, 直接使用 github 的官方 mcp server, 手动调用里面提供的方法. AI 在这里面唯一做的事情只是帮你决定调用的 tool_name + params**.

用我们自己实现的 MCP Client 和 Server 改写上面的代码:

```typescript
const messages: MessageParam[] = [
  {
    role: 'user',
    content: `分析一下 package.json`,
  },
];

const mcpClient = new McpClient();
const resp = await client.messages.create({
  max_tokens: 1024,
  messages,
  model: 'glm-4.7-flash',
  tools: await mcpClient.listTools(),
});

const toolUseResults: ContentBlockParam[] = [];
for (const block of resp.content) {
  if (block.type === 'tool_use') {
    if (block.name.startsWith('github')) {
      try {
        const result = await mcpClient.callTool(block.name, block.input);
        toolUseResults.push({ tool_use_id: block.id, type: 'tool_result', content: result, is_error: false });
      } catch (err) {
        toolUseResults.push({
          tool_use_id: block.id,
          type: 'tool_result',
          content: JSON.stringify(err),
          is_error: true,
        });
      }
    }
  }
}
messages.push({ role: 'user', content: toolUseResults });

const resp2 = await client.messages.create({
  max_tokens: 1024,
  messages,
  model: 'glm-4.7-flash',
  tools,
});
console.log(resp2);
```

瞬间简洁了不少. github 相关的 tools 定义和实现都外置到了 MCP Server 上, 这样就做了两层解耦:

1. 具体语言解耦 - 你可以用任何语言实现 MCP Server, 只要它能处理字符串.
2. LLM 解耦 - 你可以用任何支持 tool use 的 LLM, MCP 协议里单独定义了字段, 和 LLM 自己的字段无关.

# Skills

现在你已经了解到了:

1. Tool Use 是 LLM 自身的能力.
2. MCP 不是 LLM 自身的能力, 而是工程设计, 辅助 Tool Use 用的.

那么最近很火的 Skills 又是什么呢? 是取代 MCP 的吗? 当然不是.

LLM 的 context 是非常宝贵的. 如果在系统提示词里放入太多的内容, 会导致系统提示词本身就占据大量 context. 举个例子, 假设你在开发一个 Coding Agent, 你集成了 github MCP Server, 那么每次 LLM API 调用, 都会把完整的 github MCP 相关的 tools 定义全部发给 LLM. 如果绝大部分用户根本就不会用 github 的能力, 那你就平白无故浪费了大量 context.

这就是 Skills 解决的问题: 渐进式披露, 或者叫按需加载.

我个人猜测 Skills 应该也是工程设计, 也不是 LLM 的能力, 因为我们完全可以自己实现一套机制, 用下面的系统提示词:

```
你是一个全能专家. 你拥有以下技能:

1. 做饭: 川菜, 粤菜, 日料, 英国美食.
2. 旅游: 规划旅游路线, 选择最佳景点, 解说历史遗迹.
3. 写代码: Typescript, Rust, Go, Python.
...
99. 视频制作: 制作爆款视频, 通过制造各种对立吸引流量.
100. Slides 制作: 制作精美的, 吸引领导眼光的 Slides.

所有的技能都被单独放到了 .skills 目录里. 当用户的问题与某个技能相关时, 你需要使用 Read tool 来读取对应技能的全部文档.
```

看到了吗? 系统提示词里只放了最基本的技能名字和简介(也就是 SKILL.md 开头的 name + description), 没有放具体技能的内容 (比如具体怎么做菜, 具体怎么写代码, 具体制造哪种对立更符合当下的热点), 大幅节约了 context.

如果此时用户问"帮我用 Rust 写个基本的 HTTP Server", 那么 LLM 第一条返回的消息应该就包含一个 read 的 tool_use, 读取 `.skills/coding` 里所有的内容, 里面就会包含具体的细节, 比如 "不要用 unwrap", "优先使用 axum 框架" 等. 用户把这些内容通过 `tool_use_result` 发给 LLM 后, LLM 再去写最终的代码给用户.

所以 Skills 也并不是什么神奇的事情, 并不是说 Skills 赋予了 AI 大量额外的能力, 只是单纯地通过按需加载, 节约了 context, 从而可以放大量的 Skills 在目录里. 毕竟在 Skills 出现之前, 你完全也可以把具体的写代码能力写到系统提示词里, LLM 照样会拥有完整的写代码的能力.

# 总结

本文从 0 开始一步步讲述了 LLM API 的设计, 多轮对话, 原生 Tool Use 的方式, MCP 的原理, Skills 的思想. 让我们回顾一下几个核心要点:

## Tool Use - LLM 的核心能力

Tool Use 是 **LLM 模型本身的能力**, 需要模型在训练时就支持. 它让 LLM 能够:

- 理解工具的定义和参数
- 根据用户意图决策应该调用哪个工具
- 以**结构化的格式**输出工具调用信息

如果一个 LLM 不支持 Tool Use, 我们几乎无法通过工程手段来弥补, 因为用 prompt 的方式既不可靠, 又难以解析.

## MCP - 工程层面的协议

MCP 是**纯粹的工程设计**, 和 AI 完全无关. 它解决的是工程问题:

- **跨语言**: 用任何语言都可以实现 MCP Server, 不局限于某个生态
- **解耦**: tools 的定义和实现从应用代码中分离出去
- **复用**: 同一个 MCP Server 可以被多个应用、多个 LLM 使用
- **标准化**: 统一了工具的通信协议, 避免了各自为政

MCP 的价值在于**降低了集成成本**, 让开发者可以专注于业务逻辑, 而不是重复造轮子.

## Skills - 优化 Context 的策略

Skills 同样是**工程层面的优化**, 核心思想是:

- **按需加载**: 不把所有能力都塞进系统提示词
- **渐进式披露**: 需要什么能力才加载什么内容
- **节约 Context**: 让有限的 context window 发挥更大价值

Skills 不是新技术, 而是一种**最佳实践模式**, 在 Skills 概念出现之前我们就可以自己实现类似机制.

## 三者的关系

Tool Use, MCP, Skills 并不是互相取代的关系, 而是**相辅相成**:

```
┌─────────────────────────────────────────┐
│          AI Application                 │
│  ┌────────────────────────────────┐     │
│  │  Skills (按需加载能力)          │     │
│  │  - 系统提示词优化                │     │
│  │  - Context 管理                 │     │
│  └────────────────────────────────┘     │
│                                         │
│  ┌────────────────────────────────┐     │
│  │  MCP Client (工具集成层)        │     │
│  │  - 从 MCP Server 获取工具定义    │     │
│  │  - 调用 MCP Server 执行工具     │     │
│  └────────────────────────────────┘     │
│                    ↓                    │
│  ┌────────────────────────────────┐     │
│  │  LLM with Tool Use (AI 能力层) │     │
│  │  - 理解工具                      │     │
│  │  - 决策调用                      │     │
│  └────────────────────────────────┘     │
└─────────────────────────────────────────┘
                    ↕
        ┌──────────────────────┐
        │   MCP Server (外部)   │
        │   - github tools      │
        │   - filesystem tools  │
        │   - database tools    │
        └──────────────────────┘
```

- **Tool Use** 是基础, 没有它其他都无从谈起
- **MCP** 让工具的集成变得简单和标准化
- **Skills** 让能力的组织变得高效

## 实践建议

在实际开发 AI 应用时:

1. **选择支持 Tool Use 的 LLM**: 这是硬性要求, 没有商量余地
2. **优先使用现有的 MCP Server**: 不要重复造轮子, github/filesystem 等常用工具都有官方 MCP Server
3. **合理组织 Skills**: 如果你的系统提示词超过几千 tokens, 考虑用 Skills 模式进行按需加载
4. **理解工程本质**: MCP 和 Skills 都是工程问题, 理解其原理后完全可以根据需求自己实现或调整

## 最后

希望本文帮助你厘清了 Tool Use, MCP, Skills 三者的关系. 记住核心观点: **Tool Use 是 AI 能力, MCP 和 Skills 是工程设计**. 它们各司其职, 共同构建了现代 AI Agent 的能力体系.

当你在开发 AI 应用时遇到问题, 先问自己: 这是 LLM 能力的问题, 还是工程设计的问题? 如果是 LLM 能力的问题, 我们就没法自己解决了, 只能换 LLM; 如果是工程设计的问题, 在这个极高速发展的行业, 如果还没有解决方案, 那我们是完全有能力去解决的.

目前属于 LLM 能力(需要训练支持)的概念:

- Tool Use
- Thinking
- Structured Output
- Multimodal

属于工程设计, 但是很难去 polyfill, 需要服务提供方支持的概念:

- Streaming
- Cache
- Batch API

属于工程设计, 并且比较容易 polyfill 的概念:

- MCP
- Skills
- SubAgent
