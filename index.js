import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import OpenAI from "openai";

// 1. Initialize the OpenAI SDK for NVIDIA NIM
const openai = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: "https://integrate.api.nvidia.com/v1"
});

// 2. Initialize the MCP Server
const server = new Server({
  name: "nvidia-mcp-bridge",
  version: "1.2.1"
}, {
  capabilities: { tools: {} }
});

// 3. Register both the Gemma and DeepSeek tools with safe schemas
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "ask_gemma_4",
        description: "Query Google's Gemma 4 31B via NVIDIA NIM with a dynamic token budget. Ideal for high-speed logical reasoning and general everyday coding.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "The coding task or prompt to evaluate."
            },
            max_tokens: {
              type: "integer",
              description: "Token budget limit. Typical choices: 4096 (QA), 8192 (Classes), 16384 (Deep Thinking)."
            }
          },
          required: ["prompt"]
        }
      },
      {
        name: "ask_deepseek_v4",
        description: "Query DeepSeek AI V4 Pro via NVIDIA NIM. Ideal for intense software engineering, large multi-file edits, and complex math/logic tasks.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "The coding task, prompt, or full codebase context."
            },
            max_tokens: {
              type: "integer",
              description: "Generation token budget. Common choices: 8192 (Default), 16384 (Full class), 32768 (Large modules), 65536+ (Massive files)."
            }
          },
          required: ["prompt"]
        }
      }
    ]
  };
});

// 4. Track timestamps to respect the 40 RPM limit
const requestTimestamps = [];

// 5. Tool Call Execution Handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name !== "ask_gemma_4" && name !== "ask_deepseek_v4") {
    throw new Error("Unknown tool requested");
  }

  const prompt = args.prompt;

  // --- Dynamic Model Fallbacks & Bounds ---
  let max_tokens = args.max_tokens;
  let modelName = "";
  let finalMaxTokens = 4096;

  if (name === "ask_deepseek_v4") {
    modelName = "deepseek-ai/deepseek-v4-pro";
    // HEURISTIC: If input is huge (>8000 chars), automatically give it more output room
    const defaultDeepSeekFallback = prompt.length > 8000 ? 32768 : 8192;
    max_tokens = max_tokens || defaultDeepSeekFallback;
    // Explicit ceiling to prevent API rejects
    finalMaxTokens = Math.min(max_tokens, 131072);
  } else {
    modelName = "google/gemma-4-31b-it";
    max_tokens = max_tokens || 4096;
    // Safe ceiling for Gemma
    finalMaxTokens = Math.min(max_tokens, 32768);
  }

  // --- Sliding Window Rate Limiter for 40 RPM ---
  const now = Date.now();
  while (requestTimestamps.length > 0 && requestTimestamps[0] <= now - 60000) {
    requestTimestamps.shift();
  }

  if (requestTimestamps.length >= 35) {
    const waitTime = 60000 - (now - requestTimestamps[0]);
    console.error(`[RATE LIMIT WARNING] Throttling request for ${Math.ceil(waitTime / 1000)}s...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  requestTimestamps.push(Date.now());
  console.error(`[NVIDIA BRIDGE] Invoking ${modelName} (Tokens: ${finalMaxTokens})`);

  try {
    // Construct the payload dynamically
    const completionOptions = {
      model: modelName,
      messages: [{ role: "user", content: prompt }],
      max_tokens: finalMaxTokens,
      temperature: 0.7,
      top_p: 0.95
    };

    // Enable thinking reasoning specifically for the Gemma 4 model if needed
    if (modelName === "google/gemma-4-31b-it") {
      completionOptions.extra_body = {
        chat_template_kwargs: { "enable_thinking": true }
      };
    }

    const response = await openai.chat.completions.create(completionOptions);

    return {
      content: [{ type: "text", text: response.choices[0].message.content }]
    };

  } catch (error) {
    if (error.status === 429 || error.message.includes("429")) {
      return {
        content: [{ type: "text", text: "Rate limit hit (40 RPM). Please wait up to 60 seconds." }],
        isError: true
      };
    }
    return {
      content: [{ type: "text", text: `Error from NVIDIA API: ${error.message}` }],
      isError: true
    };
  }
});

// 6. Connect via Standard Input/Output
const transport = new StdioServerTransport();
await server.connect(transport);