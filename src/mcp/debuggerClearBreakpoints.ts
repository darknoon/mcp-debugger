import z from "zod";
import { resolve } from "path";

import { jsonContent, server, sessions } from "./server";
import { existsSync } from "fs";

server.tool(
  "debuggerClearBreakpoints",
  `Clears all of the breakpoints in a file. Path can be either relative to the CWD, or, absolute.`,
  {
    sessionId: z
      .string()
      .optional()
      .describe(
        "The session ID of the debugger session (uses last session if not provided)",
      ),
    filePath: z.string().describe("The file path to clear breakpoints from"),
  },
  async ({ sessionId, filePath }) => {
    const session = sessions.getLastOrSpecific(sessionId);
    if (!session) {
      throw new Error(
        sessionId
          ? `Session ${sessionId} not found`
          : "No active debug session",
      );
    }

    // Resolve path relative to CWD (either the one specified in debuggerRun or process.cwd())
    const cwd = session.cwd || process.cwd();
    const absolutePath = filePath.startsWith("/")
      ? filePath
      : resolve(cwd, filePath);

    if (!existsSync(absolutePath)) {
      throw new Error(`File ${absolutePath} not found`);
    }

    await session.request("setBreakpoints", {
      source: {
        path: absolutePath,
      },
      breakpoints: [],
    });

    return jsonContent({
      success: true,
      filePath: absolutePath,
      message: `All breakpoints cleared from ${absolutePath}`,
    });
  },
);
