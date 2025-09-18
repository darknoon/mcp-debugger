import z from "zod";

import { yamlContent, server, sessions } from "./server";

server.tool(
  "debuggerWaitUntilBreakpoint",
  `MUST BE CALLED AFTER debuggerContinue. At least, make sure the process is running. Waits until a breakpoint, or returns immediately if already stopped.`,
  {
    sessionId: z
      .string()
      .optional()
      .describe(
        "The session ID of the debugger session (uses last session if not provided)",
      ),
    timeout: z
      .number()
      .default(30000)
      .describe("Timeout in milliseconds (default: 30000)"),
  },
  async ({ sessionId, timeout }) => {
    const session = sessions.getLastOrSpecific(sessionId);

    if (!session) {
      throw new Error(
        sessionId
          ? `Session ${sessionId} not found`
          : "No active debug session",
      );
    }

    const startTime = Date.now();
    const checkInterval = 100;

    // Helper function to check if the debugger is currently stopped
    const isCurrentlyStopped = () => {
      const allEvents = session.readEvents(0, 10000).events;

      // Find the last stopped and continued events
      let lastStoppedEvent = null;
      let lastStoppedIndex = -1;
      let lastContinuedEvent = null;
      let lastContinuedIndex = -1;

      for (let i = allEvents.length - 1; i >= 0; i--) {
        const event = allEvents[i];
        if (!lastStoppedEvent && event.event === "stopped") {
          lastStoppedEvent = event;
          lastStoppedIndex = i;
        }
        if (!lastContinuedEvent && event.event === "continued") {
          lastContinuedEvent = event;
          lastContinuedIndex = i;
        }
        if (lastStoppedEvent && lastContinuedEvent) break;
      }

      // Check for terminated event as well
      const hasTerminated = allEvents.some((e) => e.event === "terminated");
      if (hasTerminated) {
        return { stopped: true, reason: "terminated", event: null };
      }

      // If we have a stopped event and either no continued event, or the stopped event came after
      const isStopped =
        lastStoppedEvent &&
        (!lastContinuedEvent || lastStoppedIndex > lastContinuedIndex);

      return {
        stopped: isStopped,
        event: isStopped ? lastStoppedEvent : null,
      };
    };

    // Check if already stopped
    const currentState = isCurrentlyStopped();
    if (currentState.stopped) {
      if (currentState.reason === "terminated") {
        return yamlContent({
          success: true,
          reason: "terminated",
          elapsed: 0,
          description: "Program has terminated",
          alreadyStopped: true,
        });
      }

      const stoppedBody = currentState.event?.body as any;
      return yamlContent({
        success: true,
        reason: stoppedBody?.reason || "stopped",
        elapsed: 0,
        threadId: stoppedBody?.threadId,
        hitBreakpointIds: stoppedBody?.hitBreakpointIds,
        description: stoppedBody?.description || `Already stopped`,
        alreadyStopped: true,
      });
    }

    // Wait for a stop event
    return new Promise((resolve) => {
      const checkForStop = () => {
        const elapsed = Date.now() - startTime;

        // Check for timeout
        if (elapsed >= timeout) {
          resolve(
            yamlContent({
              success: false,
              reason: "timeout",
              elapsed,
              message: `Timeout after ${timeout}ms waiting for stop`,
            }),
          );
          return;
        }

        // Check current state
        const state = isCurrentlyStopped();
        if (state.stopped) {
          if (state.reason === "terminated") {
            resolve(
              yamlContent({
                success: true,
                reason: "terminated",
                elapsed,
                description: "Program has terminated",
              }),
            );
            return;
          }

          const stoppedBody = state.event?.body as any;
          resolve(
            yamlContent({
              success: true,
              reason: stoppedBody?.reason || "stopped",
              elapsed,
              threadId: stoppedBody?.threadId,
              hitBreakpointIds: stoppedBody?.hitBreakpointIds,
              description:
                stoppedBody?.description ||
                `Stopped due to: ${stoppedBody?.reason || "unknown"}`,
            }),
          );
          return;
        }

        // Continue checking
        setTimeout(checkForStop, checkInterval);
      };

      checkForStop();
    });
  },
);
