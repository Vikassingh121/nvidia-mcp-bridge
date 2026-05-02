import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import OpenAI from "openai";

// 1. Initialize the OpenAI SDK for NVIDIA NIM with an explicit timeout
const openai = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: "https://integrate.api.nvidia.com/v1",
  timeout: 120000 // Forces an error instead of hanging indefinitely
});

// 2. Initialize the MCP Server
const server = new Server({
  name: "nvidia-mcp-bridge",
  version: "1.2.3"
}, {
  capabilities: { tools: {} }
});

// 3. Register tools
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

async function checkRateLimit() {
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
}

function handleApiError(error, toolName) {
  let userFriendlyError = "";

  if (error.name === "APIConnectionTimeoutError" || error.message.includes("timeout")) {
    userFriendlyError = `🚨 [TIMEOUT] The NVIDIA NIM API took too long to respond. Please try again.`;
  } else if (error.status === 429 || error.message.includes("429")) {
    userFriendlyError = "🚨 [NVIDIA API LIMIT] You have hit the 40 RPM limit. Please wait 60 seconds.";
  } else if (error.message.includes("Missing credentials")) {
    userFriendlyError = "🚨 [CONFIGURATION ERROR] Your NVIDIA API Key is missing or invalid in mcp_config.json.";
  } else {
    userFriendlyError = `🚨 Error executing ${toolName}: ${error.message}`;
  }

  console.error(`[CRITICAL MCP ERROR]: ${userFriendlyError}`);
  return {
    content: [{ type: "text", text: userFriendlyError }],
    isError: true
  };
}

// 5. Tool Call Execution Handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "ask_gemma_4") {
    try {
      const prompt = args.prompt;
      const requestedTokens = args.max_tokens || 4096;
      const finalMaxTokens = Math.min(requestedTokens, 32768);

      await checkRateLimit();
      console.error(`[NVIDIA BRIDGE] Invoking google/gemma-4-31b-it (Tokens: ${finalMaxTokens})`);

      const response = await openai.chat.completions.create({
        model: "google/gemma-4-31b-it",
        messages: [{ role: "user", content: prompt }],
        max_tokens: finalMaxTokens,
        temperature: 0.7,
        top_p: 0.95,
        extra_body: {
          chat_template_kwargs: { "enable_thinking": true }
        }
      });

      return {
        content: [{ type: "text", text: response.choices[0].message.content }]
      };

    } catch (error) {
      return handleApiError(error, name);
    }
  }

  if (name === "ask_deepseek_v4") {
    try {
      const prompt = args.prompt;
      const defaultDeepSeekFallback = prompt.length > 8000 ? 32768 : 8192;
      const requestedTokens = args.max_tokens || defaultDeepSeekFallback;
      const finalMaxTokens = Math.min(requestedTokens, 131072);

      await checkRateLimit();
      console.error(`[NVIDIA BRIDGE] Invoking deepseek-ai/deepseek-v4-pro (Tokens: ${finalMaxTokens})`);

      const response = await openai.chat.completions.create({
        model: "deepseek-ai/deepseek-v4-pro",
        messages: [{ role: "user", content: prompt }],
        max_tokens: finalMaxTokens,
        temperature: 0.7,
        top_p: 0.95
      });

      return {
        content: [{ type: "text", text: response.choices[0].message.content }]
      };

    } catch (error) {
      return handleApiError(error, name);
    }
  }

  throw new Error("Unknown tool requested");
});

// 6. Connect via Standard Input/Output
const transport = new StdioServerTransport();
await server.connect(transport);