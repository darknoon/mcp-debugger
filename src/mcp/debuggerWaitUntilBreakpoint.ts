import z from "zod";

import { jsonContent, server, sessions } from "./server";

server.tool(
  "debuggerWaitUntilBreakpoint",
  {
    sessionId: z
      .string()
      .optional()
      .describe("The session ID of the debugger session (uses last session if not provided)"),
    timeout: z
      .number()
      .default(30000)
      .describe("Timeout in milliseconds (default: 30000)"),
  },
  async ({ sessionId, timeout }) => {
    const session = sessions.getLastOrSpecific(sessionId);
    
    if (!session) {
      throw new Error(sessionId ? `Session ${sessionId} not found` : "No active debug session");
    }

    const startTime = Date.now();
    const checkInterval = 100;
    
    // First check if we're already in a stopped state
    const allEvents = session.readEvents(0, 10000).events;
    
    // Find the last stopped and continued events by searching from the end
    let lastStoppedEvent = null;
    let lastStoppedIndex = -1;
    let lastContinuedEvent = null;
    let lastContinuedIndex = -1;
    
    for (let i = allEvents.length - 1; i >= 0; i--) {
      if (!lastStoppedEvent && allEvents[i].event === "stopped") {
        lastStoppedEvent = allEvents[i];
        lastStoppedIndex = i;
      }
      if (!lastContinuedEvent && allEvents[i].event === "continued") {
        lastContinuedEvent = allEvents[i];
        lastContinuedIndex = i;
      }
      if (lastStoppedEvent && lastContinuedEvent) break;
    }
    
    // If we have a stopped event and either no continued event, or the stopped event came after the continued event
    const isCurrentlyStopped = lastStoppedEvent && (!lastContinuedEvent || lastStoppedIndex > lastContinuedIndex);
    
    if (isCurrentlyStopped && lastStoppedEvent && lastStoppedEvent.body) {
      const stoppedBody = lastStoppedEvent.body as any;
      // Return immediately with the current stopped state
      return jsonContent({
        success: true,
        reason: stoppedBody.reason || "stopped",
        elapsed: 0,
        threadId: stoppedBody.threadId,
        hitBreakpointIds: stoppedBody.hitBreakpointIds,
        description: stoppedBody.description || `Already stopped due to: ${stoppedBody.reason}`,
        alreadyStopped: true,
      });
    }
    
    // Record the current event count to track only new events
    const initialEventCount = session.readEvents(0, 10000).events.length;
    
    return new Promise((resolve) => {
      const checkForBreakpoint = () => {
        const elapsed = Date.now() - startTime;
        
        if (elapsed >= timeout) {
          resolve(
            jsonContent({
              success: false,
              reason: "timeout",
              elapsed,
              message: `Timeout after ${timeout}ms waiting for breakpoint`,
            })
          );
          return;
        }

        // Read only events that occurred after we started waiting
        const allEvents = session.readEvents(0, 10000).events;
        const newEvents = allEvents.slice(initialEventCount);
        
        // Look for a stopped event in the new events
        const stoppedEvent = newEvents.find((e) => e.event === "stopped");

        if (stoppedEvent && stoppedEvent.body) {
          const stoppedBody = stoppedEvent.body as any;
          
          // Check if it's a breakpoint or any other stop reason
          if (stoppedBody.reason === "breakpoint") {
            resolve(
              jsonContent({
                success: true,
                reason: "breakpoint",
                elapsed,
                threadId: stoppedBody.threadId,
                hitBreakpointIds: stoppedBody.hitBreakpointIds,
                description: stoppedBody.description,
              })
            );
            return;
          } else if (stoppedBody.reason) {
            // Also return for other stop reasons (step, exception, etc.)
            resolve(
              jsonContent({
                success: true,
                reason: stoppedBody.reason,
                elapsed,
                threadId: stoppedBody.threadId,
                description: stoppedBody.description || `Stopped due to: ${stoppedBody.reason}`,
              })
            );
            return;
          }
        }

        setTimeout(checkForBreakpoint, checkInterval);
      };

      checkForBreakpoint();
    });
  },
);