import z from "zod";
import { readFileSync } from "fs";

import { jsonContent, server, sessions } from "./server";

server.tool(
  "debuggerStatus",
  {
    sessionId: z
      .string()
      .optional()
      .describe("The session ID of the debugger session (uses last session if not provided)"),
  },
  async ({ sessionId }) => {
    const session = sessions.getLastOrSpecific(sessionId);
    
    if (!session) {
      throw new Error(sessionId ? `Session ${sessionId} not found` : "No active debug session");
    }

    const status: any = {
      sessionId: session.id,
      started: session.started,
    };

    try {
      const threadsResponse = await session.request("threads");
      status.threads = threadsResponse.threads;

      const lastStoppedEvent = session
        .readEvents(0, 1000)
        .events.reverse()
        .find((e) => e.event === "stopped");

      if (lastStoppedEvent && lastStoppedEvent.body) {
        const stoppedBody = lastStoppedEvent.body as any;
        const threadId = stoppedBody.threadId || threadsResponse.threads[0]?.id;

        if (threadId) {
          status.stoppedReason = stoppedBody.reason;
          status.stoppedThreadId = threadId;

          const stackTraceResponse = await session.request("stackTrace", {
            threadId,
            levels: 20,
          });
          status.stackTrace = stackTraceResponse.stackFrames;

          if (stackTraceResponse.stackFrames.length > 0) {
            const topFrame = stackTraceResponse.stackFrames[0];
            status.currentFrame = topFrame;

            if (topFrame.source?.path) {
              try {
                const fileContent = readFileSync(topFrame.source.path, "utf-8");
                const lines = fileContent.split("\n");
                const startLine = Math.max(0, topFrame.line - 6);
                const endLine = Math.min(lines.length, topFrame.line + 5);
                
                status.sourceContext = {
                  file: topFrame.source.path,
                  currentLine: topFrame.line,
                  lines: lines
                    .slice(startLine, endLine)
                    .map((line, idx) => ({
                      number: startLine + idx + 1,
                      content: line,
                      current: startLine + idx + 1 === topFrame.line,
                    })),
                };
              } catch (error) {
                console.error(`[debuggerStatus] Could not read source file: ${error}`);
              }
            }

            const scopesResponse = await session.request("scopes", {
              frameId: topFrame.id,
            });
            status.scopes = [];

            for (const scope of scopesResponse.scopes) {
              const variablesResponse = await session.request("variables", {
                variablesReference: scope.variablesReference,
              });
              
              status.scopes.push({
                name: scope.name,
                variables: variablesResponse.variables,
              });
            }
          }
        }
      }
    } catch (error) {
      console.error(`[debuggerStatus] Error getting status: ${error}`);
      status.error = String(error);
    }

    return jsonContent(status);
  },
);