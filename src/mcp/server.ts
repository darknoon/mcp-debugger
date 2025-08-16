import { z } from "zod";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { TcpTransport } from "../dap/transport";
import { DapSession, SessionRegistry } from "../dap/session";

const sessions = new SessionRegistry();

function jsonContent(json: any): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(json, null, 2) }],
  } as const;
}

function makeServer() {
  const server = new McpServer({ name: "mcp-debugger", version: "1.0.0" });

  server.tool(
    "attachDebugger",
    {
      host: z.string().default(process.env.DAP_HOST || "127.0.0.1"),
      port: z
        .number()
        .int()
        .default(parseInt(process.env.DAP_PORT || "4711", 10)),
      args: z.any(),
    },
    async ({ host, port, args }) => {
      const transport = new TcpTransport(host, port);

      const sess = new DapSession(transport);
      sessions.add(sess);

      const body = await sess.request("initialize", "mcp-debugger");
      await sess.request("attach", args);

      return jsonContent({ sessionId: sess.id, capabilities: body });
    },
  );

  const SimpleSession = z.object({ sessionId: z.string() });
  server.tool("dap.configurationDone", SimpleSession.shape, async (args) => {
    const { sessionId } = SimpleSession.parse(args);
    const sess = sessions.get(sessionId)!;
    await sess.request("configurationDone", {});
    return {
      content: [{ type: "text", text: JSON.stringify({}, null, 2) }],
    } as any;
  });

  const SetBps = z.object({ sessionId: z.string(), args: z.any() });
  server.tool("dap.setBreakpoints", SetBps.shape, async (args) => {
    const { sessionId, args: sargs } = SetBps.parse(args);
    const sess = sessions.get(sessionId)!;
    const body = await sess.request("setBreakpoints", sargs);
    return {
      content: [{ type: "text", text: JSON.stringify(body, null, 2) }],
    } as any;
  });

  for (const [name, cmd] of Object.entries({
    threads: "threads",
    stackTrace: "stackTrace",
    scopes: "scopes",
    variables: "variables",
    evaluate: "evaluate",
    continue: "continue",
    next: "next",
    stepIn: "stepIn",
    stepOut: "stepOut",
    pause: "pause",
  })) {
    const AnyArgs = z.object({
      sessionId: z.string(),
      args: z.any().optional(),
    });
    server.tool(`dap.${name}` as any, AnyArgs.shape, async (args) => {
      const { sessionId, args: par } = AnyArgs.parse(args);
      const sess = sessions.get(sessionId)!;
      const body = await sess.request(cmd, par ?? {});
      return {
        content: [{ type: "text", text: JSON.stringify(body ?? {}, null, 2) }],
      } as any;
    });
  }

  const ReadEvents = z.object({
    sessionId: z.string(),
    sinceSeq: z.number().optional(),
    limit: z.number().optional(),
  });
  server.tool("dap.readEvents", ReadEvents.shape, async (args) => {
    const { sessionId, sinceSeq, limit } = ReadEvents.parse(args);
    const sess = sessions.get(sessionId)!;
    const out = sess.readEvents(sinceSeq ?? 0, limit ?? 100);
    return {
      content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
    } as any;
  });

  const Disconnect = z.object({
    sessionId: z.string(),
    args: z.any().optional(),
  });
  server.tool("dap.disconnect", Disconnect.shape, async (args) => {
    const { sessionId, args: par } = Disconnect.parse(args);
    const sess = sessions.get(sessionId)!;
    try {
      await sess.request("disconnect", par ?? {});
    } catch {}
    sess.close();
    return {
      content: [{ type: "text", text: JSON.stringify({}, null, 2) }],
    } as any;
  });

  server.tool(
    "dap.listSessions",
    {},
    async () =>
      ({
        content: [
          {
            type: "text",
            text: JSON.stringify({ sessions: sessions.list() }, null, 2),
          },
        ],
      }) as any,
  );

  return server;
}

export async function runServerStdio() {
  const server = makeServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("DAP MCP server running on stdio");
}
