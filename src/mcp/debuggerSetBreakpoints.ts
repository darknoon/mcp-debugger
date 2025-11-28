import z from "zod";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

import { yamlContent, server, sessions } from "./server";

server.tool(
  "debuggerSetBreakpoints",
  {
    sessionId: z
      .string()
      .optional()
      .describe(
        "The session ID of the debugger session (uses last session if not provided)",
      ),
    filePath: z
      .string()
      .describe("The file path where the breakpoints should be set"),
    breakpoints: z
      .array(
        z.object({
          old_str: z
            .string()
            .describe(
              "The string to search for in the file to determine breakpoint location. This must not span multiple lines.",
            ),
          condition: z
            .string()
            .optional()
            .describe(
              "An expression that must evaluate to true for the breakpoint to trigger",
            ),
          hitCondition: z
            .string()
            .optional()
            .describe(
              "Expression for hit count condition (e.g., '> 5', '== 10', '% 2')",
            ),
          logMessage: z
            .string()
            .optional()
            .describe(
              "Message to log instead of breaking (logpoint). Can contain {expressions} in braces.",
            ),
        }),
      )
      .describe("Array of breakpoints to set in the file"),
  },
  async ({ sessionId, filePath, breakpoints }) => {
    const session = sessions.getLastOrSpecific(sessionId);

    if (!session) {
      throw new Error(
        sessionId
          ? `Session ${sessionId} not found`
          : "No active debug session",
      );
    }

    // Validate that none of the search strings are multi-line
    for (const bp of breakpoints) {
      if (bp.old_str.includes("\n")) {
        throw new Error(
          `Search string must not span multiple lines: "${bp.old_str}"`,
        );
      }
    }

    // Resolve path relative to CWD (either the one specified in debuggerRun or process.cwd())
    const cwd = session.cwd || process.cwd();
    const absolutePath = filePath.startsWith("/")
      ? filePath
      : resolve(cwd, filePath);

    if (!existsSync(absolutePath)) {
      throw new Error(`File ${absolutePath} not found`);
    }

    // Read the file and find the line numbers for all breakpoints
    const fileContent = readFileSync(absolutePath, "utf-8");
    const lines = fileContent.split("\n");

    const breakpointLines = breakpoints.map((bp) => {
      const lineNumber =
        lines.findIndex((line) => line.includes(bp.old_str)) + 1;

      if (lineNumber === 0) {
        throw new Error(`String "${bp.old_str}" not found in file ${filePath}`);
      }

      return {
        line: lineNumber,
        old_str: bp.old_str,
        condition: bp.condition,
        hitCondition: bp.hitCondition,
        logMessage: bp.logMessage,
      };
    });

    const response = await session.request("setBreakpoints", {
      source: {
        path: absolutePath,
      },
      breakpoints: breakpointLines.map((bp) => ({
        line: bp.line,
        condition: bp.condition,
        hitCondition: bp.hitCondition,
        logMessage: bp.logMessage,
      })),
    });

    return yamlContent({
      success: true,
      filePath: absolutePath,
      breakpointLines: breakpointLines.map((bp) => ({
        line: bp.line,
        searchString: bp.old_str,
        condition: bp.condition,
        hitCondition: bp.hitCondition,
        logMessage: bp.logMessage,
      })),
      breakpoints: response.breakpoints,
    });
  },
);
