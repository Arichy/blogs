The AI Agent landscape is filled with emerging concepts:

- Tools
- MCP  
- Skills

Many people have questions like: What's the difference between Tools and MCP? Do I still need Tools if I'm using MCP? Are Skills replacing MCP? This article will start from the underlying design of LLM APIs, step by step explaining the differences between Tools and MCP, manually implement a very simple MCP (so simple you'll think "that's it?"), and finally briefly introduce Skills.

# Key Facts

- **Large models are stateless**. They have no memory of your past conversations. Each LLM API call is a completely new request, like talking to a completely new stranger.
- Developing large models themselves may be difficult and requires strong mathematical knowledge. However, developing LLM applications is not difficult, and traditional programmers who do pure engineering can get up to speed quickly.
- MCP and Skills are purely engineering-level facilities with nothing to do with AI. In other words, before these two concepts emerged, you could completely implement a similar mechanism yourself without needing LLM API support.

Based on these facts, this article will use the Anthropic API for explanation. This is because OpenAI's Responses API provides a parameter called `previous_response_id`, which **can easily mislead people into thinking that LLMs have memory capabilities**. But in fact, LLMs have no memory. This `previous_response_id` is not used by the LLM but is an engineering facility at OpenAI's service level, equivalent to OpenAI storing our history and then sending it to the LLM. The same applies to the Conversations API.

In contrast, the Anthropic API is more native, making it easier to sense the essence of LLM APIs.

# Tech Stack

- TypeScript with Bun (Node.js)
- [@anthropic-ai/sdk](https://github.com/anthropics/anthropic-sdk-typescript)

Please note the difference between `@anthropic-ai/sdk` and [@anthropic-ai/claude-agent-sdk](https://github.com/anthropics/claude-agent-sdk-typescript). The former is a wrapper around the Anthropic API, essentially an HTTP Client that encapsulates many methods for calling the API; the latter is a wrapper around Claude Code (Claude CLI) that encapsulates many methods for calling the `claude` command line.

This article will use the `GLM-4.7-flash` model, which is compatible with the Anthropic API and free, to save costs. After all, one of the biggest pain points of LLM application development is that every debugging run costs money.

```typescript
const client = new Anthropic({
  baseURL: 'https://api.z.ai/api/anthropic',
  authToken: ZAI_API_KEY,
});
```

# Hello World

Let's start with the simplest request:

```typescript
const resp = await client.messages.create({
  max_tokens: 1024,
  messages: [
    {
      role: 'user',
      content: 'What is the capital of the UK?',
    },
  ],
  model: 'glm-4.7-flash',
});

console.log(resp);
```

Output (omitting unimportant fields):

```json
{
  "id": "msg_202602151117137d34660397a4418d",
  "type": "message",
  "role": "assistant",
  "model": "glm-4.7-flash",
  "content": [
    {
      "type": "text",
      "text": "The capital of the UK is **London**."
    }
  ],
  "stop_reason": "end_turn"
}
```

# Multi-turn Conversations

As mentioned repeatedly above, LLMs are stateless. Each call is like talking to a completely new stranger. Imagine if you're chatting with someone and after every sentence the other person changes, how should the new person continue your conversation? Of course, they need to read all your previous chat history. Therefore, when calling an LLM, you need to **pass all the history every time**.

```typescript
// Use a messages array to maintain history
const messages: MessageParam[] = [
  {
    role: 'user',
    content: 'What is the capital of the UK?',
  },
];

const resp = await client.messages.create({
  max_tokens: 1024,
  messages,
  model: 'glm-4.7-flash',
});

// Key point: Put the LLM's first response into the array
messages.push({
  role: 'assistant',
  content: resp.content,
});

// Add the second conversation content
messages.push({
  role: 'user',
  content: 'Tell me about the pollution situation in this city',
});

console.log(inspect(messages));

const resp2 = await client.messages.create({
  max_tokens: 1024,
  messages,
  model: 'glm-4.7-flash',
});

console.log(resp2);
```

Let's look at the messages content passed to the API on the second call:

```json
[
  {
    "role": "user",
    "content": "What is the capital of the UK?"
  },
  {
    "role": "assistant",
    "content": [
      {
        "type": "text",
        "text": "The capital of the UK is **London**."
      }
    ]
  },
  {
    "role": "user",
    "content": "Tell me about the pollution situation in this city"
  }
]
```

The resp2 successfully returned information about London's pollution, showing that the LLM indeed perceived that the city mentioned in the previous conversation was London.

```json
{
  "id": "msg_20260215115536fd125b1bca954cf6",
  "type": "message",
  "role": "assistant",
  "model": "glm-4.7-flash",
  "content": [
    {
      "type": "text",
      "text": "As a global international metropolis and former Industrial Revolution center, London's pollution history can be traced back to the Victorian era, and it remains a 'typical sample' of global air quality governance..." // Manually truncated to reduce length, not truncated by LLM
    }
  ],
  "stop_reason": "end_turn"
}
```

So you should also understand that the so-called context window can be simply understood as the text length of the `messages` array, not the length of a single message.

# Tools

## Native Approach

An LLM is like a very smart brain (although sometimes it can be dumb, but let's assume LLMs are smart), but it only has a brain - no eyes, meaning it cannot receive information from the outside world (except manually passed in messages), such as reading a file; no hands, meaning it cannot take any actions, such as modifying a file. (You can think of an LLM as Stephen Hawking with his eyes covered).

Tools are like installing external eyes and hands for a brain. Let's first use the most naive way to let the LLM call tools: directly write in the prompt what tools are available, what params they have, and ask the LLM to choose one to use and provide params.

```typescript
const messages: MessageParam[] = [
  {
    role: 'user',
    content: `Write a one-sentence introduction about the Chinese Lunar Year of the Horse.
      You have the following tools available:
      1. { name: "write", description: "write content to a file", params: 
        { "content": {"type": "string", description: "content"} },
        { "path": {"type": "string", description: "the path of the file to write"} },
       }

      2. { name: "read", description: "read content of a file", params: 
        { "path": {"type": "string", description: "the path of the file to read"} }
       }

       Please choose a tool to use and provide correct params. You need to output a JSON
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
      "text": "```json\n{\n  \"tool\": \"write\",\n  \"params\": {\n    \"content\": \"The Chinese Lunar Year of the Horse symbolizes vitality, passion, and freedom, representing an auspicious year full of energy and fighting spirit.\",\n    \"path\": \"/year_of_horse_intro.txt\"\n  }\n}\n```"
    }
  ],
  "stop_reason": "end_turn"
}
````

As you can see, the LLM successfully chose the correct tool and the parameter content is fine, but there are several major problems:

1. The returned `text` is essentially a string. Although the prompt explicitly required returning a JSON, the LLM still returned a JSON markdown instead of a pure JSON string.
2. Prompts are unreliable. LLMs cannot 100% follow prompts, especially weaker models. They might output "Okay, here's my JSON for calling the tool: xxx". In other words, we cannot guarantee the output will definitely be a JSON markdown.
3. Even if the output is a JSON markdown, we still need to parse it. Once nesting is involved (params also containing backticks), it becomes even more complex.
4. Cannot guarantee the output JSON 100% follows the format in the prompt. For example, I've encountered cases where it returned an `arguments` field instead of `params`.

Based on these problems, Tool Use (also called Tool Call, Function Call - same meaning. Anthropic's official term is Tool Use) was built into LLMs, **becoming an LLM capability itself**. That is, if an LLM doesn't support Tool Use, we basically can't polyfill it at the engineering level, meaning we can't implement tool calling.

## Standard Approach

Let's rewrite the above example using the standard Tool Use method:

```typescript
const messages: MessageParam[] = [
  {
    role: 'user',
    content: `Write a one-sentence introduction about the Chinese Lunar Year of the Horse and save it to test.txt`,
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
    // read is similar, omitted
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
      "text": "I'll write an introduction about the Chinese Lunar Year of the Horse and save it to a file."
    },
    {
      "type": "tool_use",
      "id": "call_49f0c1dbe920406192ce9347",
      "name": "write",
      "input": {
        "content": "The Chinese Lunar Year of the Horse symbolizes vitality, passion, and freedom, representing an auspicious year full of energy and fighting spirit.",
        "path": "test.txt"
      }
    }
  ],
  "stop_reason": "tool_use"
}
```

You can see that this time the `content` contains an additional `tool_use` block which clearly specifies the name and parameters of the tool to be called. This block is structured, meaning we can 100% guarantee the format is correct and as expected (though we can't 100% guarantee there will be this block - it depends on the LLM's capability; a dumber LLM may not be able to decide which tool to use). This way we can execute the corresponding function call based on the structured `tool_use` block.

## Returning Results

Consider a scenario: having the LLM read a file and analyze its content. Based on the above content, you should know the specific process:

1. User asks the LLM to read a file and analyze content, passing in the read tool schema
2. LLM decides to use the read tool with the file path as parameter
3. User reads the file content based on the path and passes it to the LLM
4. LLM successfully outputs the analysis result

```typescript
const tools: ToolUnion[] = [
  // Details omitted in this article, two tools: read and write
];

const messages: MessageParam[] = [
  {
    role: 'user',
    content: `Analyze package.json`,
  },
];

// Initial request
const resp = await client.messages.create({
  max_tokens: 1024,
  messages,
  model: 'glm-4.7-flash',
  tools,
});

// Add the LLM's first response to messages
messages.push({
  role: 'assistant',
  content: resp.content,
});

// The first response will likely contain a tool_use block
// content is an array that may contain an additional text or just be a tool_use
// content may contain multiple tool_uses; users need to call all of them and match results using tool_use_id
const toolUseResults: ContentBlockParam[] = [];
for (const block of resp.content) {
  if (block.type === 'tool_use') {
    switch (block.name) {
      case 'read':
        try {
          const content = await readFile(block.input.path, 'utf-8');
          toolUseResults.push({ tool_use_id: block.id, type: 'tool_result', content, is_error: false }); // is_error tells the LLM if this call succeeded
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
// Pass tool use results to LLM
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

The messages passed to the LLM on the second call:

```json
[
  {
    "role": "user",
    "content": "Analyze package.json"
  },
  {
    "role": "assistant",
    "content": [
      {
        "type": "text",
        "text": "I'll help you analyze the package.json file. First, I need to read this file to view its contents."
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

The result returned from the LLM on the second call:

````json
{
  "id": "msg_2026021512452122fcf4da65474784",
  "type": "message",
  "role": "assistant",
  "model": "glm-4.7-flash",
  "content": [
    {
      "type": "text",
      "text": "## 📦 `package.json` File Analysis\n\n### Basic Information\n\n| Field | Value | Description |\n|------|-----|------|\n| **name** | `\"gh-scout\"` | Project name, used for npm package identification |\n| **module** | `\"index.tsx\"` | ES module entry file |\n| **type** | `\"module\"` | Uses ES6 module syntax |\n| **private** | `true` | Marked as private project to prevent accidental publishing to npm |\n\n### Dependency Management\n\n#### 🔧 Development Dependencies (`devDependencies`)\n```json\n\"@types/bun\": \"latest\"\n```\n- Type definition package for Bun runtime TypeScript type support\n- `\"latest\"` indicates using the latest version\n\n#### 🤝 Peer Dependencies (`peerDependencies`)\n```json\n\"typescript\": \"^5\"\n```\n- **Key point**: `typescript` is marked as a peer dependency\n- This means **the project doesn't directly depend on TypeScript**, but expects TypeScript to be installed in the user's environment\n- Suitable for plugin/tool projects, letting users choose their TS version\n\n#### ⚡ Runtime Dependencies (`dependencies`)\n```json\n\"@anthropic-ai/sdk\": \"^0.74.0\"\n```\n- Official Anthropic AI SDK\n- Version range `^0.74.0` means install 0.74.0 or higher (not exceeding major version)\n\n---\n\n### 📝 Summary\n\nThis is a **lightweight TypeScript tool project** (`gh-scout`) with main characteristics:\n\n1. **No runtime dependencies**: Apart from the Anthropic SDK, no other runtime dependencies\n2. **Depends on TypeScript**: Users provide their own TS environment\n3. **Uses Bun**: Indicated by `@types/bun`, using Bun runtime environment\n4. **Modular design**: ES module type, entry point is `index.tsx`\n\nThe project appears to be a GitHub-related tool (judging from the name \"gh-scout\"), possibly for analyzing or monitoring GitHub-related operations."
    }
  ],
  "stop_reason": "end_turn"
}
````

You can see that the LLM first tells us it needs to call the read tool to read the file content. After we complete the call and pass the result to the LLM, the LLM successfully analyzes the content on the second attempt.

A side note: at this point, you should also feel that the native LLM approach is really too cumbersome.

- messages need to be manually maintained
- tool_use needs to be manually parsed from the LLM's response, manually called, and then manually passed into the messages array
- If the LLM subsequently needs to call other tools, you still need to manually write a loop

This is exactly the significance of various AI Agent frameworks now, such as LangChain, LangGraph, Agno, etc. They are essentially doing these things at the underlying level, just like traditional frameworks, encapsulating cumbersome steps, like how writing React doesn't require manually manipulating the DOM.

# MCP

Although the above approach is cumbersome, it completely covers all scenarios. Any tool use can be implemented using the above method. So why do we still need MCP?

## What is MCP

MCP (Model Context Protocol) is a protocol that defines the communication method between MCP Client and MCP Server. **MCP's principle has nothing to do with AI/LLM**; it just defines the communication format for three types of information: tools/resources/prompts.

## What Problems Does MCP Solve

**Suppose MCP doesn't exist.**

As we all know, LLMs are very good at writing documentation, such as PR descriptions. So now you want the LLM to help you create a PR on GitHub. You need to first define a tool:

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

Then implement the calling process for this tool:

```typescript
case 'github_create_pr':
  const { repo, source_branch, target_branch, title, description } = block.input;
  const [owner_name, repo_name] = repo.split('/');

  try {
    // Can also use gh cli
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

Adding each such tool requires a lot of effort. But in reality, these tools are highly universal; calling GitHub is a very common need.

At this point, you might think: why don't I just encapsulate a `github_tools` library?

So you take action and encapsulate (or have AI encapsulate) a `github_tools` library and publish it to npm. Other users can use your library like this:

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

But then two new problems arise:

1. Your new project uses Go/Rust and can't use npm packages.
2. Because the Anthropic API is too expensive, you decide to migrate to DeepSeek API, but DeepSeek's compatibility with Anthropic isn't very good (hypothetically), and some formats don't match, causing your library to fail.

MCP emerged to solve the above problems. **MCP essentially externalizes the definition and execution of tools**. MCP is divided into Client and Server, where the Server is the externalized part responsible for tool definition and execution. The Client is the part that remains in the AI application, responsible for communicating with the Server:

- Hi Server, tell me what tools are available?
- Hi Server, I now want to call the github_create_pr tool with parameters { xxx }

## A Minimal MCP Implementation

Now that we understand MCP's design philosophy, we can completely write a minimal implementation:

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

For simplicity, I directly wrote it as a function. You can completely make it into an HTTP server because this function's return type is string, which can serve as an HTTP Response.

Then write a client:

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

Did you notice? The above code has nothing to do with LLMs. This is also the key point I've been emphasizing: MCP is engineering design, not an LLM capability. **You can completely detach from AI and directly use GitHub's official MCP server, manually calling the methods it provides. The only thing AI does here is help you decide on the tool_name + params to call**.

Rewrite the above code using our own MCP Client and Server:

```typescript
const messages: MessageParam[] = [
  {
    role: 'user',
    content: `Analyze package.json`,
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

It's instantly much cleaner. GitHub-related tool definitions and implementations are all externalized to the MCP Server, achieving two layers of decoupling:

1. Language decoupling - You can implement an MCP Server in any language as long as it can handle strings.
2. LLM decoupling - You can use any LLM that supports tool use. The MCP protocol defines its own fields independently of the LLM's own fields.

# Skills

Now you've learned:

1. Tool Use is an LLM capability.
2. MCP is not an LLM capability but an engineering design to assist Tool Use.

So what are Skills, which have become very popular recently? Are they replacing MCP? Of course not.

LLM context is extremely precious. If you put too much content in the system prompt, the system prompt itself will occupy a large amount of context. For example, suppose you're developing a Coding Agent and you integrate GitHub MCP Server. Then every LLM API call will send the complete GitHub MCP-related tool definitions to the LLM. If the vast majority of users don't use GitHub capabilities at all, you're wasting a large amount of context for nothing.

This is the problem Skills solves: progressive disclosure, or on-demand loading.

I personally guess that Skills is also engineering design, not an LLM capability, because we can completely implement a similar mechanism ourselves using the following system prompt:

```
You are an all-around expert. You have the following skills:

1. Cooking: Sichuan cuisine, Cantonese cuisine, Japanese cuisine, British cuisine.
2. Travel: Planning travel routes, choosing the best attractions, explaining historical sites.
3. Coding: TypeScript, Rust, Go, Python.
...
99. Video production: Creating viral videos by manufacturing various conflicts to attract traffic.
100. Slide production: Creating exquisite slides that attract leadership attention.

All skills are stored separately in the .skills directory. When a user's question relates to a certain skill, you need to use the Read tool to read the complete documentation for that skill.
```

See? The system prompt only contains the basic skill names and brief introductions (i.e., the name + description at the beginning of SKILL.md), without the specific skill content (such as how to cook specifically, how to write code specifically, what kinds of conflicts to manufacture based on current hot topics), greatly saving context.

If at this point the user asks "Help me write a basic HTTP Server in Rust", then the LLM's first returned message should contain a read tool_use to read all the content in `.skills/coding`, which will include specific details such as "don't use unwrap", "prioritize using the axum framework", etc. After the user passes this content to the LLM through `tool_use_result`, the LLM will then write the final code for the user.

So Skills is not something magical. It doesn't mean Skills endows AI with a lot of extra capabilities; it's simply saving context through on-demand loading, allowing a large number of Skills to be placed in the directory. After all, before Skills emerged, you could completely write the specific coding capabilities into the system prompt, and the LLM would still have complete coding capabilities.

# Summary

This article has step by step explained the design of LLM APIs, multi-turn conversations, native Tool Use approaches, MCP's principles, and Skills' philosophy from scratch. Let's review the key points:

## Tool Use - Core LLM Capability

Tool Use is **an LLM model capability itself**, requiring support during model training. It enables LLMs to:

- Understand tool definitions and parameters
- Decide which tool to call based on user intent
- Output tool call information in a **structured format**

If an LLM doesn't support Tool Use, we can hardly compensate through engineering means, because using prompts is both unreliable and difficult to parse.

## MCP - Engineering-Level Protocol

MCP is **purely engineering design**, completely unrelated to AI. It solves engineering problems:

- **Cross-language**: MCP Servers can be implemented in any language, not limited to any ecosystem
- **Decoupling**: Tool definitions and implementations are separated from application code
- **Reusability**: The same MCP Server can be used by multiple applications and multiple LLMs
- **Standardization**: Unified tool communication protocol, avoiding fragmentation

MCP's value lies in **reducing integration costs**, allowing developers to focus on business logic rather than reinventing the wheel.

## Skills - Context Optimization Strategy

Skills is also **engineering-level optimization**, with core ideas being:

- **On-demand loading**: Don't cram all capabilities into the system prompt
- **Progressive disclosure**: Load content for capabilities only when needed
- **Save context**: Let the limited context window deliver greater value

Skills is not new technology but a **best practice pattern**. We could implement similar mechanisms ourselves before the Skills concept emerged.

## The Relationship Between the Three

Tool Use, MCP, and Skills are not mutually replacing relationships but **complementary**:

```
┌─────────────────────────────────────────┐
│          AI Application                 │
│  ┌────────────────────────────────┐     │
│  │  Skills (On-demand loading)     │     │
│  │  - System prompt optimization   │     │
│  │  - Context management           │     │
│  └────────────────────────────────┘     │
│                                         │
│  ┌────────────────────────────────┐     │
│  │  MCP Client (Tool integration)  │     │
│  │  - Get tool defs from MCP Server│     │
│  │  - Call MCP Server to exec tools│     │
│  └────────────────────────────────┘     │
│                    ↓                    │
│  ┌────────────────────────────────┐     │
│  │  LLM with Tool Use (AI layer)   │     │
│  │  - Understand tools             │     │
│  │  - Decide calling               │     │
│  └────────────────────────────────┘     │
└─────────────────────────────────────────┘
                    ↕
        ┌──────────────────────┐
        │   MCP Server (External)│
        │   - github tools       │
        │   - filesystem tools   │
        │   - database tools     │
        └──────────────────────┘
```

- **Tool Use** is the foundation; without it, nothing else can be discussed
- **MCP** makes tool integration simple and standardized
- **Skills** makes capability organization efficient

## Practical Recommendations

When actually developing AI applications:

1. **Choose LLMs that support Tool Use**: This is a hard requirement, no room for negotiation
2. **Prioritize using existing MCP Servers**: Don't reinvent the wheel; common tools like github/filesystem have official MCP Servers
3. **Organize Skills reasonably**: If your system prompt exceeds several thousand tokens, consider using the Skills pattern for on-demand loading
4. **Understand engineering essence**: MCP and Skills are both engineering problems. After understanding their principles, you can completely implement or adjust them according to your needs

## Finally

I hope this article helps you clarify the relationship between Tool Use, MCP, and Skills. Remember the core viewpoint: **Tool Use is AI capability, MCP and Skills are engineering design**. They each have their own roles, jointly building the capability system of modern AI Agents.

When you encounter problems developing AI applications, ask yourself first: Is this an LLM capability problem or an engineering design problem? If it's an LLM capability problem, we can't solve it ourselves and can only switch LLMs; if it's an engineering design problem, in this extremely fast-growing industry, if there's no solution yet, we completely have the ability to solve it.

Currently LLM capabilities (requiring training support):

- Tool Use
- Thinking
- Structured Output
- Multimodal

Engineering design that's hard to polyfill and requires service provider support:

- Streaming
- Cache
- Batch API

Engineering design that's relatively easy to polyfill:

- MCP
- Skills
- SubAgent
