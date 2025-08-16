import z from "zod";

import { jsonContent, server, sessions } from "./server";

server.tool(
  "debuggerSources",
  {
    sessionId: z.string().optional().describe("The session ID of the debugger session (uses last session if not provided)"),
  },
  async ({ sessionId }) => {
    const session = sessions.getLastOrSpecific(sessionId);

    if (!session) {
      throw new Error(sessionId ? `Session ${sessionId} not found` : "No active debug session");
    }

    try {
      const response = await session.request("loadedSources");
      
      return jsonContent({
        sources: response.sources || [],
        count: response.sources?.length || 0,
      });
    } catch (error) {
      return jsonContent({
        sources: [],
        count: 0,
        error: String(error),
      });
    }
  },
);