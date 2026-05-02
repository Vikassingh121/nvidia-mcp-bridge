# NVIDIA MCP Bridge

A Model Context Protocol (MCP) server that bridges Antigravity and other MCP clients to NVIDIA's NIM (NVIDIA Inference Microservices) API. This bridge enables high-performance reasoning and coding assistance using state-of-the-art open models.

## Features

- **Multi-Model Support**: Direct access to Google's **Gemma 4 31B** and **DeepSeek V4 Pro**.
- **Thinking Mode**: Automatically enables "thinking/reasoning" capabilities for Gemma 4 via NVIDIA NIM's chat template kwargs.
- **Dynamic Token Budgets**: Scalable output budgets from 4k up to 128k (for DeepSeek) to handle everything from quick Q&A to massive file refactors.
- **Smart Rate-Limiting**: Built-in proactive throttling at 35 RPM to stay safely within NVIDIA's 40 RPM free tier limits.
- **Automatic Heuristics**: DeepSeek tool automatically scales its token budget based on input size for large codebase context.
- **Real-time Diagnostic Telemetry**: Stderr logging to verify tool calls, model selection, token counts, and stream health in real-time.
- **Extended Timeouts**: 5-minute (300,000ms) global timeout to accommodate deep-reasoning tasks.
- **Congestion Resilience**: Optimized parameters (e.g., medium reasoning effort) to maintain responsiveness during peak traffic.

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
   Visit [build.nvidia.com](https://build.nvidia.com/) to generate your free API key.

## Configuration

### Environment Variables
The server requires:
- `NVIDIA_API_KEY`: Your NVIDIA NIM API key.

### Adding to Antigravity
Add the bridge to your Antigravity configuration file. 

**Path:** `C:\Users\<YourUsername>\.gemini\antigravity\mcp_config.json`

```json
{
  "mcpServers": {
    "nvidia-bridge": {
      "command": "C:/Program Files/nodejs/node.exe",
      "args": [
        "D:/Projects/nvidia-mcp-bridge/index.js"
      ],
      "cwd": "D:/Projects/nvidia-mcp-bridge",
      "env": {
        "NVIDIA_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

> [!IMPORTANT]
> Ensure the **path to `index.js`** in `args` and the **`cwd`** match the actual location of the project on your system.

## Quick Test

Verify the bridge is working by asking:

`@nvidia-bridge: tell me about yourself.`

## Available Tools

### `ask_gemma_4`
Query Google's Gemma 4 31B model. Best for high-speed logical reasoning and everyday coding tasks.
- **Prompt**: (Required) The task or question.
- **max_tokens**: (Optional) 4096 (Default), 8192, 16384 (Deep Thinking), up to 32768.

### `ask_deepseek_v4`
Query DeepSeek AI V4 Pro. Optimized for intense software engineering, large multi-file edits, and complex logic.
- **Prompt**: (Required) The task or codebase context.
- **max_tokens**: (Optional) 8192 (Default), 16384, 32768 (Large modules), up to 131072.

---

## How to Force a Specific Model (Optional)

If you want absolute control and don't want the agent to guess, you can bypass its decision-making entirely by naming the specific tool in your prompt:

- **To guarantee Gemma 4**: `@nvidia-bridge use ask_gemma_4 to explain this regex pattern.`
- **To guarantee DeepSeek V4 Pro**: `@nvidia-bridge use ask_deepseek_v4 to debug this async race condition.`

---

## Summary Checklist

- **Normal Chat (No @)**: Always uses native Gemini.
- **Typing `@nvidia-bridge`**: Let the AI Agent pick between Gemma 4 or DeepSeek V4 based on the complexity of your prompt.
- **Typing `@nvidia-bridge use ask_[model]`**: Forces the exact model you want.

---

## Model Comparison

| Model | Primary Strength | Max Tokens | Best Use Case |
| :--- | :--- | :--- | :--- |
| **Gemma 4 31B** | Logical Reasoning & "Thinking" | 32,768 | Fast logic checks, specific bug fixes. |
| **DeepSeek V4 Pro** | Large-scale Software Engineering | 131,072 | Massive refactors, complex mathematical logic. |
| **Gemini 3 Flash** | Massive Context (Native) | 1,000,000 | Reading entire projects, huge codebase analysis. |

---

## 🔍 Diagnostic Logging

To ensure transparency during complex reasoning, the bridge outputs detailed telemetry to `stderr`. This allows you to monitor the request lifecycle without interfering with the standard MCP protocol.

**Key Log Markers:**
- `[NVIDIA BRIDGE] Waiting for stream...`: Request sent, awaiting initial response.
- `[NVIDIA BRIDGE] First chunk received.`: The model has finished its internal reasoning and started streaming content.
- `[NVIDIA BRIDGE] Stream complete. Total chunks: [X]`: Confirms full response delivery.

## ❓ Troubleshooting

### Latency & "Hanging" Responses
If you experience delays or tool timeouts:
1. **DeepSeek Traffic**: DeepSeek V4 Pro can experience significant latency during peak global traffic hours. If it takes longer than 60 seconds to see the "First chunk" log, the server is likely congested.
2. **Switch to Gemma 4**: If DeepSeek is unresponsive, **Gemma 4** is often a more stable alternative during high-traffic periods.
3. **Check Logs**: Monitor your MCP server logs for the diagnostic markers mentioned above to distinguish between network hangs and deep-reasoning wait times.

## Development

```bash
# Run locally to verify setup
node index.js
```

## License
Apache 2.0

