import * as YAML from "yaml";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { SessionRegistry } from "../dap/session";

export function yamlContent(json: any): CallToolResult {
  return {
    content: [{ type: "text", text: YAML.stringify(json, null, 2) }],
  } as const;
}

export const server = new McpServer({ name: "mcp-debugger", version: "1.0.0" });
export const sessions = new SessionRegistry();

export async function runServerStdio() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("DAP MCP server running on stdio");
}
