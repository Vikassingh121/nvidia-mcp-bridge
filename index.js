import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { 
  ListToolsRequestSchema, 
  CallToolRequestSchema 
} from "@modelcontextprotocol/sdk/types.js";
import OpenAI from "openai";

// 1. Initialize the OpenAI SDK configured for NVIDIA NIM
const openai = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY, 
  baseURL: "https://integrate.api.nvidia.com/v1"
});

// 2. Initialize the MCP Server
const server = new Server({
  name: "nvidia-mcp-bridge",
  version: "1.0.0"
}, {
  capabilities: { tools: {} }
});

// 3. Register the NVIDIA Tool with Antigravity
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "ask_gemma_4",
        description: "Query Google's Gemma 4 31B model via NVIDIA NIM for advanced coding assistance and reasoning.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "The coding task, prompt, or code context to evaluate."
            }
          },
          required: ["prompt"]
        }
      }
    ]
  };
});

// 4. Handle Antigravity's request by calling NVIDIA via the OpenAI SDK
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "ask_gemma_4") {
    const prompt = request.params.arguments.prompt;

    // Add this line to see the verification in real time:
    console.error(`[NVIDIA BRIDGE CALLED] Forwarding prompt to Gemma 4: "${prompt}"`);

    try {
      const response = await openai.chat.completions.create({
        model: "google/gemma-4-31b-it",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 4096,
        temperature: 0.7,
        // Optional parameter for enabling thinking/reasoning on NVIDIA NIM
        extra_body: {
          chat_template_kwargs: { "enable_thinking": true }
        }
      });

      return {
        content: [{ type: "text", text: response.choices[0].message.content }]
      };
    } catch (error) {
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
