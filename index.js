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

// Keep track of recent request timestamps globally
const requestTimestamps = [];

// 2. Initialize the MCP Server
const server = new Server({
  name: "nvidia-mcp-bridge",
  version: "1.1.0"
}, {
  capabilities: { tools: {} }
});

// 3. Register the Dynamic Tool with Antigravity
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
              description: "Token budget: 4096 (QA), 8192 (Classes), 16384 (Thinking Mode), 32768 (Full modules).",
              enum: [4096, 8192, 16384, 32768]
            }
          },
          required: ["prompt"]
        }
      }
    ]
  };
});

// 4. Handle dynamic token execution and smart rate-limiting
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "ask_gemma_4") {
    const prompt = request.params.arguments.prompt;
    
    // Extract max_tokens dynamically from the tool call arguments
    // Falls back to 4096 if the agent does not provide one
    const max_tokens = request.params.arguments.max_tokens || 4096;

    // --- Smart Rate-Limiter Logic ---
    // 1. Clean up timestamps older than 60 seconds
    const now = Date.now();
    while (requestTimestamps.length > 0 && requestTimestamps[0] <= now - 60000) {
      requestTimestamps.shift();
    }

    // 2. If hitting the limit, pause dynamically
    if (requestTimestamps.length >= 35) {
      const waitTime = 60000 - (now - requestTimestamps[0]);
      console.error(`[RATE LIMIT WARNING] Approaching 40 RPM limit. Throttling for ${Math.ceil(waitTime / 1000)}s...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    // 3. Record the current request timestamp
    requestTimestamps.push(Date.now());
    // --------------------------------

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
      // Handle rate limit errors explicitly
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

// 5. Connect via Standard Input/Output
const transport = new StdioServerTransport();
await server.connect(transport);
