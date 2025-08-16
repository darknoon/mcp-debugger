import z from "zod";

import { jsonContent, server, sessions } from "./server";

server.tool(
  "debuggerEval",
  {
    sessionId: z
      .string()
      .optional()
      .describe("The session ID of the debugger session (uses last session if not provided)"),
    expression: z
      .string()
      .describe("The Python expression to evaluate"),
    frameId: z
      .number()
      .optional()
      .describe("The frame ID to evaluate in (uses current frame if not provided)"),
  },
  async ({ sessionId, expression, frameId }) => {
    const session = sessions.getLastOrSpecific(sessionId);
    
    if (!session) {
      throw new Error(sessionId ? `Session ${sessionId} not found` : "No active debug session");
    }

    let targetFrameId = frameId;
    
    if (!targetFrameId) {
      const lastStoppedEvent = session
        .readEvents(0, 1000)
        .events.reverse()
        .find((e) => e.event === "stopped");
      
      if (lastStoppedEvent && lastStoppedEvent.body) {
        const threadId = (lastStoppedEvent.body as any).threadId;
        if (threadId) {
          try {
            const stackTraceResponse = await session.request("stackTrace", {
              threadId,
              levels: 1,
            });
            targetFrameId = stackTraceResponse.stackFrames[0]?.id;
          } catch (error) {
            console.error(`[debuggerEval] Could not get frame ID: ${error}`);
          }
        }
      }
    }

    try {
      const response = await session.request("evaluate", {
        expression,
        frameId: targetFrameId,
        context: "repl",
      });

      return jsonContent({
        success: true,
        result: response.result,
        type: response.type,
        variablesReference: response.variablesReference,
      });
    } catch (error) {
      return jsonContent({
        success: false,
        error: String(error),
        expression,
      });
    }
  },
);