import z from "zod";

import { jsonContent, server, sessions } from "./server";

server.tool(
  "debuggerLogs",
  `Gets the logs from a running debugger session`,
  {
    sessionId: z
      .string()
      .optional()
      .describe(
        "The session ID of the debugger session (uses last session if not provided)",
      ),
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
      throw new Error(
        sessionId
          ? `Session ${sessionId} not found`
          : "No active debug session",
      );
    }

    let logs = session.processLogs || [];

    // Filter by type if specified
    if (type !== "all") {
      logs = logs.filter((log) => log.type === type);
    }

    // Apply pagination
    const paginatedLogs = logs.slice(since, since + limit);

    // Format logs as a nice string
    let formattedOutput = "";
    
    // Add header with metadata
    formattedOutput += `=== Debugger Logs (${since + 1}-${since + paginatedLogs.length} of ${logs.length}) ===\n`;
    
    if (paginatedLogs.length === 0) {
      formattedOutput += "No logs available";
      if (type !== "all") {
        formattedOutput += ` for type: ${type}`;
      }
      formattedOutput += "\n";
    } else {
      // Format each log entry
      paginatedLogs.forEach((log, index) => {
        const timestamp = new Date(log.timestamp).toISOString().split('T')[1].split('.')[0];
        const lineNumber = since + index + 1;
        const typeLabel = log.type === "stdout" ? "[OUT]" : "[ERR]";
        
        // Split multi-line output and format each line
        const lines = log.data.split('\n');
        lines.forEach((line, lineIndex) => {
          if (line.trim()) {
            if (lineIndex === 0) {
              formattedOutput += `${lineNumber.toString().padStart(4)} ${timestamp} ${typeLabel} ${line}\n`;
            } else {
              // Continuation lines get indentation
              formattedOutput += `${"".padStart(4)}               ${line}\n`;
            }
          }
        });
      });
    }
    
    // Add footer if there are more logs
    if (since + paginatedLogs.length < logs.length) {
      formattedOutput += `\n... ${logs.length - since - paginatedLogs.length} more log entries available (use since=${since + paginatedLogs.length}) ...`;
    }

    return jsonContent({
      output: formattedOutput
    });
  },
);
