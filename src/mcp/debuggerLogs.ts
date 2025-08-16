import z from "zod";

import { jsonContent, server, sessions } from "./server";

server.tool(
  "debuggerLogs",
  {
    sessionId: z.string().optional().describe("The session ID of the debugger session (uses last session if not provided)"),
    since: z
      .number()
      .default(0)
      .describe("Start index for reading logs (default: 0)"),
    limit: z
      .number()
      .default(100)
      .describe("Maximum number of logs to return (default: 100)"),
    type: z
      .enum(["all", "stdout", "stderr"])
      .default("all")
      .describe("Filter logs by type (default: all)"),
  },
  async ({ sessionId, since, limit, type }) => {
    const session = sessions.getLastOrSpecific(sessionId);

    if (!session) {
      throw new Error(sessionId ? `Session ${sessionId} not found` : "No active debug session");
    }

    let logs = session.processLogs || [];

    // Filter by type if specified
    if (type !== "all") {
      logs = logs.filter((log) => log.type === type);
    }

    // Apply pagination
    const paginatedLogs = logs.slice(since, since + limit);

    return jsonContent({
      logs: paginatedLogs,
      totalCount: logs.length,
      nextIndex: since + paginatedLogs.length,
      hasMore: since + paginatedLogs.length < logs.length,
    });
  },
);
