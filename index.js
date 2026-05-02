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
  version: "1.1.1"
}, {
  capabilities: { tools: {} }
});

// 3. Register the Fixed Tool Schema with Antigravity
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "ask_gemma_4",
        description: "Query Google's Gemma 4 31B via NVIDIA NIM with a dynamic token budget.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "The coding task or prompt to evaluate."
            },
            max_tokens: {
              type: "integer",
              description: "Token budget limit. Example values: 4096 (QA), 8192 (Classes), 16384 (Deep Thinking), 32768 (Full modules)."
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

// 5. Handle dynamic execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "ask_gemma_4") {
    const prompt = request.params.arguments.prompt;
    const max_tokens = request.params.arguments.max_tokens || 4096;

    // Sliding window rate-limiter for the 40 RPM limit
    const now = Date.now();
    while (requestTimestamps.length > 0 && requestTimestamps[0] <= now - 60000) {
      requestTimestamps.shift();
    }

    if (requestTimestamps.length >= 35) {
      const waitTime = 60000 - (now - requestTimestamps[0]);
      console.error(`[RATE LIMIT] Throttling request for ${Math.ceil(waitTime / 1000)}s...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    requestTimestamps.push(Date.now());

    console.error(`[NVIDIA BRIDGE] Forwarding to Gemma 4 (Tokens: ${max_tokens})`);

    try {
      const response = await openai.chat.completions.create({
        model: "google/gemma-4-31b-it",
        messages: [{ role: "user", content: prompt }],
        max_tokens: max_tokens,
        temperature: 0.7,
        extra_body: {
          chat_template_kwargs: { "enable_thinking": true }
        }
      });

      return {
        content: [{ type: "text", text: response.choices[0].message.content }]
      };
    } catch (error) {
      if (error.status === 429 || error.message.includes("429")) {
        return {
          content: [{ type: "text", text: "Rate limit hit. Please wait 60 seconds." }],
          isError: true
        };
      }
      return {
        content: [{ type: "text", text: `Error from NVIDIA API: ${error.message}` }],
        isError: true
      };
    }
  }

  throw new Error("Unknown tool requested");
});

// 6. Connect via Standard Input/Output
const transport = new StdioServerTransport();
await server.connect(transport);