import z from "zod";

import { jsonContent, server, sessions } from "./server";

server.tool(
  "debuggerContinue",
  {
    sessionId: z
      .string()
      .optional()
      .describe("The session ID of the debugger session to continue (uses last session if not provided)"),
  },
  async ({ sessionId }) => {
    const session = sessions.getLastOrSpecific(sessionId);
    
    if (!session) {
      throw new Error(sessionId ? `Session ${sessionId} not found` : "No active debug session");
    }

    let response;
    let command;
    
    if (!session.started) {
      response = await session.request("configurationDone");
      session.started = true;
      command = "configurationDone";
    } else {
      // Get the thread ID from the last stopped event
      const lastStoppedEvent = session
        .readEvents(0, 10000)
        .events.reverse()
        .find((e) => e.event === "stopped");
      
      let threadId = 1; // Default to thread 1
      if (lastStoppedEvent && lastStoppedEvent.body) {
        const stoppedBody = lastStoppedEvent.body as any;
        if (stoppedBody.threadId) {
          threadId = stoppedBody.threadId;
        }
      }
      
      response = await session.request("continue", { threadId });
      command = "continue";
    }

    return jsonContent({
      success: true,
      command,
      response,
    });
  },
);