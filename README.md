# NVIDIA MCP Bridge

A Model Context Protocol (MCP) server that bridges Antigravity and other MCP clients to NVIDIA's NIM (NVIDIA Inference Microservices) API. Specifically, it enables high-performance reasoning using Google's **Gemma 4 31B** model.

## Features

- **Gemma 4 31B Integration**: Direct access to one of the most capable open models for coding and reasoning.
- **Thinking Mode**: Automatically enables "thinking/reasoning" capabilities via NVIDIA NIM's chat template kwargs.
- **Dynamic Token Budgets**: Choose between 4k and 32k tokens per request for different task complexities.
- **Smart Rate-Limiting**: Built-in proactive throttling at 35 RPM to prevent API errors.
- **Real-time Logging**: Built-in stderr logging to verify tool calls and token counts as they happen.
- **Standard Protocol**: Built on the `@modelcontextprotocol/sdk` for seamless integration with any MCP client.

## Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd nvidia-mcp-bridge
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Get an NVIDIA API Key**:
   Visit [build.nvidia.com](https://build.nvidia.com/) to generate your API key.

## Configuration

### Environment Variables
The server requires the following environment variable:
- `NVIDIA_API_KEY`: Your NVIDIA NIM API key.

### Adding to Antigravity
To use this bridge, add it to your Antigravity configuration file. 

**Path:** `C:\Users\username\.gemini\antigravity\mcp_config.json`

```json
{
  "mcpServers": {
    "nvidia-bridge": {
      "command": "C:/Program Files/nodejs/node.exe",
      "args": [
        "D:/Projects/nvidia-mcp-bridge/index.js"
      ],
      "env": {
        "NVIDIA_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

> [!IMPORTANT]
> Make sure to update the **path to `index.js`** in the `args` section above to match the actual location where you cloned this repository on your machine.

## Quick Test

To verify the bridge is working correctly in Antigravity, type this in the chat:

`@nvidia-bridge use the ask_gemma_4 tool to tell me what your model name is`

## Available Tools

### `ask_gemma_4`
Query Google's Gemma 4 31B model via NVIDIA NIM for advanced coding assistance and reasoning.

**Arguments:**
- `prompt` (string, required): The coding task or context to evaluate.
- `max_tokens` (integer, optional): Choose a token budget based on the task:
    - `4096`: Standard Q&A (Default)
    - `8192`: Classes and complex functions
    - `16384`: Thinking Mode / Deep reasoning
    - `32768`: Full modules and large files

---

## Switching Between Models

| Capability | Gemini 3.1 Pro (Native) | Gemma 4 (NVIDIA NIM) |
| :--- | :--- | :--- |
| **How to Activate** | Just type normally (or select via model dropdown). | Type `@nvidia-bridge` / use `ask_gemma_4`. |
| **Reset Rules** | Governed by Antigravity's limits. | Governed by NVIDIA's free API limits (Proactive 35 RPM limit). |
| **Context Window** | Up to **2 million tokens** per session. | **Dynamic** (Up to **32,768 tokens** per call). |
| **Ideal Tasks** | Reading entire directories, big refactoring jobs. | Isolated code optimizations, general development Q&A. |

## Development

To modify the bridge, edit `index.js`. The server uses `StdioServerTransport` for communication.

```bash
# Test the server locally (requires API key)
node index.js
```

## License
Apache 2.0
