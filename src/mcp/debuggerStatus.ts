import z from "zod";
import { readFileSync } from "fs";

import { yamlContent, server, sessions } from "./server";

server.tool(
  "debuggerStatus",
  {
    sessionId: z
      .string()
      .optional()
      .describe(
        "The session ID of the debugger session (uses last session if not provided)",
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

    const status: any = {
      sessionId: session.id,
      started: session.started,
    };

    // Check if the program has terminated
    const events = session.readEvents(0, 10000).events;
    const hasTerminated = events.some((e) => e.event === "terminated");

    if (hasTerminated) {
      // Find exit event for more details
      const exitEvent = events.find((e) => e.event === "exited");

      status.state = "terminated";
      status.message = "Program has finished execution";

      if (exitEvent?.body) {
        const exitBody = exitEvent.body as any;
        status.exitCode = exitBody.exitCode;
      }

      return yamlContent(status);
    }

    // Check if currently stopped and determine program state
    let lastStoppedEvent = null;
    let lastStoppedIndex = -1;
    let lastContinuedEvent = null;
    let lastContinuedIndex = -1;
    let hasStarted = false;

    for (let i = events.length - 1; i >= 0; i--) {
      if (!lastStoppedEvent && events[i].event === "stopped") {
        lastStoppedEvent = events[i];
        lastStoppedIndex = i;
        hasStarted = true; // A stopped event means the program has started
      }
      if (!lastContinuedEvent && events[i].event === "continued") {
        lastContinuedEvent = events[i];
        lastContinuedIndex = i;
        hasStarted = true; // A continued event means the program has started
      }
      if (lastStoppedEvent && lastContinuedEvent) break;
    }

    // Determine the state
    // Check if we sent a continue request more recently than the last stopped event
    const continueIsMoreRecent =
      session.eventCountAtLastContinue !== null &&
      lastStoppedIndex < session.eventCountAtLastContinue;

    if (!hasStarted && !session.eventCountAtLastContinue) {
      status.state = "not_started";
    } else if (continueIsMoreRecent) {
      // We sent a continue request after the last stopped event, so we're running
      status.state = "running";
    } else if (
      lastStoppedEvent &&
      (!lastContinuedEvent || lastStoppedIndex > lastContinuedIndex)
    ) {
      status.state = "stopped";
    } else {
      status.state = "running";
    }

    try {
      // Only try to get threads if not terminated
      const threadsResponse = await session.request("threads", {});
      status.threads = threadsResponse.threads;

      if (status.state === "stopped" && lastStoppedEvent?.body) {
        const stoppedBody = lastStoppedEvent.body as any;
        const threadId = stoppedBody.threadId || threadsResponse.threads[0]?.id;

        if (threadId) {
          status.stoppedReason = stoppedBody.reason;
          status.stoppedThreadId = threadId;
          status.stoppedDescription = stoppedBody.description;

          try {
            const stackTraceResponse = await session.request("stackTrace", {
              threadId,
              startFrame: 0,
              levels: 20,
            });
            status.stackTrace = stackTraceResponse.stackFrames;

            if (stackTraceResponse.stackFrames.length > 0) {
              const topFrame = stackTraceResponse.stackFrames[0];
              status.currentFrame = topFrame;

              if (topFrame.source?.path) {
                try {
                  const fileContent = readFileSync(
                    topFrame.source.path,
                    "utf-8",
                  );
                  const lines = fileContent.split("\n");
                  const startLine = Math.max(0, topFrame.line - 6);
                  const endLine = Math.min(lines.length, topFrame.line + 5);

                  status.sourceContext = {
                    file: topFrame.source.path,
                    currentLine: topFrame.line,
                    lines: lines.slice(startLine, endLine).map((line, idx) => ({
                      number: startLine + idx + 1,
                      content: line,
                      current: startLine + idx + 1 === topFrame.line,
                    })),
                  };
                } catch (error) {
                  console.error(
                    `[debuggerStatus] Could not read source file: ${error}`,
                  );
                }
              }

              try {
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
              } catch (error) {
                console.error(
                  `[debuggerStatus] Could not get scopes: ${error}`,
                );
              }
            }
          } catch (error) {
            console.error(
              `[debuggerStatus] Could not get stack trace: ${error}`,
            );
          }
        }
      }
    } catch (error) {
      // If we can't get threads, the debugger connection might be lost
      const errorMessage = String(error);
      if (
        errorMessage.includes("disconnected") ||
        errorMessage.includes("Server")
      ) {
        status.state = "disconnected";
        status.message = "Debugger disconnected - program may have terminated";
      } else {
        status.error = errorMessage;
      }
    }

    return yamlContent(status);
  },
);
