import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
// import { WebSocketServerTransport } from "@modelcontextprotocol/sdk";
import { z } from "zod";

// Create server instance
const server = new McpServer({
  name: "debugger",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
  },
});

server.tool("startDebugger", "Start the debugger", {
    description: "Start the debugger",
    parameters: z.object({
        port: z.number().default(8080),
    }),
}, async (args) => {
    console.log("Starting debugger on port", args);
    return {
        content: [{
            type: "text",
            text: `Debugger started on port ${args.port}`,
        }],
    };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Debugger MCP Server running on stdio transport");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});