import z from "zod";
import { readFileSync } from "fs";
import { resolve } from "path";

import { jsonContent, server, sessions } from "./server";

server.tool(
  "debuggerSetBreakpoints",
  {
    sessionId: z
      .string()
      .optional()
      .describe("The session ID of the debugger session (uses last session if not provided)"),
    filePath: z
      .string()
      .describe("The file path where the breakpoint should be set"),
    old_str: z
      .string()
      .describe("The string to search for in the file to determine breakpoint location"),
  },
  async ({ sessionId, filePath, old_str }) => {
    const session = sessions.getLastOrSpecific(sessionId);
    
    if (!session) {
      throw new Error(sessionId ? `Session ${sessionId} not found` : "No active debug session");
    }

    // Resolve path relative to CWD (either the one specified in debuggerRun or process.cwd())
    const cwd = session.cwd || process.cwd();
    const absolutePath = resolve(cwd, filePath);

    // Read the file and find the line number
    const fileContent = readFileSync(absolutePath, "utf-8");
    const lines = fileContent.split("\n");
    
    const lineNumber = lines.findIndex(line => line.includes(old_str)) + 1;
    
    if (lineNumber === 0) {
      throw new Error(`String "${old_str}" not found in file ${filePath}`);
    }

    const response = await session.request("setBreakpoints", {
      source: {
        path: absolutePath,
      },
      breakpoints: [
        {
          line: lineNumber,
        },
      ],
    });

    return jsonContent({
      success: true,
      filePath: absolutePath,
      lineNumber,
      breakpoints: response.breakpoints,
    });
  },
);