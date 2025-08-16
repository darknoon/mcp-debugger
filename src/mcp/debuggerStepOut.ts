import z from "zod";

import { jsonContent, server, sessions } from "./server";

server.tool(
  "debuggerStepOut",
  `Traverses 1 outside the call stack while the debugger is paused (because of a breakpoint perhaps)`,
  {
    sessionId: z
      .string()
      .optional()
      .describe(
        "The session ID of the debugger session (uses last session if not provided)",
      ),
    threadId: z
      .number()
      .optional()
      .describe(
        "The thread ID to step out of (uses last stopped thread if not provided)",
      ),
  },
  async ({ sessionId, threadId }) => {
    const session = sessions.getLastOrSpecific(sessionId);

    if (!session) {
      throw new Error(
        sessionId
          ? `Session ${sessionId} not found`
          : "No active debug session",
      );
    }

    let targetThreadId = threadId;

    if (!targetThreadId) {
      const lastStoppedEvent = session
        .readEvents(0, 1000)
        .events.reverse()
        .find((e) => e.event === "stopped");

      if (lastStoppedEvent && lastStoppedEvent.body) {
        targetThreadId = (lastStoppedEvent.body as any).threadId;
      }

      if (!targetThreadId) {
        const threadsResponse = await session.request("threads");
        targetThreadId = threadsResponse.threads[0]?.id;
      }
    }

    if (!targetThreadId) {
      throw new Error("No thread ID available for stepping");
    }

    const response = await session.request("stepOut", {
      threadId: targetThreadId,
    });

    return jsonContent({
      success: true,
      command: "stepOut",
      threadId: targetThreadId,
      response,
    });
  },
);
