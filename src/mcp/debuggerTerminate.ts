import z from "zod";

import { jsonContent, server, sessions } from "./server";

server.tool(
  "debuggerTerminate",
  "Terminates a running debugger session",
  {
    sessionId: z
      .string()
      .optional()
      .describe(
        "The session ID of the debugger session to terminate (uses last session if not provided)",
      ),
  },
  async ({ sessionId }) => {
    const session = sessions.getLastOrSpecific(sessionId);

    if (!session) {
      throw new Error(
        sessionId
          ? `Session ${sessionId} not found`
          : "No active debug session",
      );
    }

    const actualSessionId = session.id;

    try {
      if (session.started) {
        await session.request("disconnect", {
          terminateDebuggee: true,
        });
      }
    } catch (error) {
      console.error(
        `[debuggerTerminate] Error disconnecting session: ${error}`,
      );
    }

    // Ensure the process is killed
    if (session.process && !session.process.killed) {
      console.error(
        `[debuggerTerminate] Forcefully killing process ${session.process.pid}`,
      );
      session.process.kill("SIGKILL");
    }

    session.close();
    sessions.delete(actualSessionId);

    return jsonContent({
      success: true,
      message: `Session ${actualSessionId} terminated`,
    });
  },
);
