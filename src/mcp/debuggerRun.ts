import z from "zod";
import { spawn } from "child_process";
import getPort from "get-port";

import { jsonContent, server, sessions } from "./server";
import { TcpTransport } from "../dap/transport";
import { DapSession } from "../dap/session";

server.tool(
  "debuggerRun",
  `
This starts the built-in debugger, which currently supports Python projects. Use this instead of Bash() or your built-in Shell tools, when wanting to execute the Python project.

A typical flow might look like:
- debuggerRun
- [any debuggerSetBreakpoints you'd like]
- debuggerContinue <-- starts the process
- debuggerWaitUntilBreakpoint

You can also use a non-blocking version of "debuggerWaitUntilBreakpoint" named "debuggerStatus," which
has additional info too. This is useful if you wanna go do other things :0
`,
  {
    args: z
      .array(z.string())
      .optional()
      .describe(
        "Arguments to pass to the Python script, starting with either -m or the .py file.",
      ),
    cwd: z
      .string()
      .optional()
      .describe(
        "Working directory for the Python process, requires you to have UV & debugpy installed in that directory's UV venv. If you leave this blank it'll use the demo project which has these.",
      ),
  },
  async ({ args = [], cwd }) => {
    // Get a free port for debugpy
    const port = await getPort();
    const host = "127.0.0.1";

    // Start debugpy subprocess
    const debugpyArgs = [
      "run",
      "-m",
      "debugpy",
      "--wait-for-client",
      "--listen",
      `${port}`,
      "--configure-subProcess",
      "False",
      ...args,
    ];

    const pythonProcess = spawn("uv", debugpyArgs, {
      cwd: cwd || process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Store stdout/stderr buffers temporarily until session is created
    const tempLogs: {
      type: "stdout" | "stderr";
      timestamp: number;
      data: string;
    }[] = [];

    // Handle process output
    pythonProcess.stdout?.on("data", (data) => {
      const log = {
        type: "stdout" as const,
        timestamp: Date.now(),
        data: data.toString(),
      };
      tempLogs.push(log);
      console.error(`[debugpy stdout]: ${data.toString()}`);
    });

    pythonProcess.stderr?.on("data", (data) => {
      const log = {
        type: "stderr" as const,
        timestamp: Date.now(),
        data: data.toString(),
      };
      tempLogs.push(log);
      console.error(`[debugpy stderr]: ${data.toString()}`);
    });

    pythonProcess.on("error", (error) => {
      console.error(`[debugpy error]: ${error.message}`);
    });

    pythonProcess.on("exit", (code, signal) => {
      console.error(`[debugpy exit]: code=${code}, signal=${signal}`);
    });

    // Give debugpy a moment to start listening and retry connection if needed
    let transport: TcpTransport | null = null;
    let sess: DapSession | null = null;
    const maxRetries = 5;
    const retryDelay = 1000;

    for (let i = 0; i < maxRetries; i++) {
      try {
        await new Promise((resolve) => setTimeout(resolve, retryDelay));

        // Try to connect to the DAP server
        transport = new TcpTransport(host, port);
        sess = new DapSession(transport);

        // If we got here, connection succeeded
        break;
      } catch (error) {
        console.error(`[debugpy] Connection attempt ${i + 1} failed: ${error}`);
        if (i === maxRetries - 1) {
          // Last attempt failed, clean up and throw
          pythonProcess.kill();
          throw new Error(
            `Failed to connect to debugpy after ${maxRetries} attempts: ${error}`,
          );
        }
      }
    }

    if (!sess || !transport) {
      pythonProcess.kill();
      throw new Error("Failed to establish DAP session");
    }

    sessions.add(sess);

    // Store the process reference so we can clean it up later if needed
    sess.pythonProcess = pythonProcess;
    // Store the cwd for relative path resolution in breakpoint commands
    sess.cwd = cwd || process.cwd();

    // Transfer temp logs to session and set up continuous logging
    sess.processLogs = tempLogs;

    // Replace the listeners to log to session instead of temp array
    pythonProcess.stdout?.removeAllListeners("data");
    pythonProcess.stdout?.on("data", (data) => {
      sess.processLogs.push({
        type: "stdout",
        timestamp: Date.now(),
        data: data.toString(),
      });
      console.error(`[debugpy stdout]: ${data.toString()}`);
    });

    pythonProcess.stderr?.removeAllListeners("data");
    pythonProcess.stderr?.on("data", (data) => {
      sess.processLogs.push({
        type: "stderr",
        timestamp: Date.now(),
        data: data.toString(),
      });
      console.error(`[debugpy stderr]: ${data.toString()}`);
    });

    try {
      await sess.request("initialize", {
        clientID: "mcp-debugger",
        adapterID: "debugpy",
      });
    } catch (error) {
      console.error("[debugpy] Failed to initialize DAP session:", error);
      sess.close(); // This will also kill the Python process
      throw new Error(`Failed to initialize DAP session: ${error}`);
    }

    // Intentionally don't await this... DAP is a little quirky.
    void sess
      .request("attach", {
        connect: {
          host,
          port,
        },
      })
      .then(() => {
        sess.started = true;
      })
      .catch((error) => {
        console.error("[debugpy] Failed to attach to debug session:", error);
        // Don't throw here since we're in an async context
      });

    return jsonContent({
      sessionId: sess.id,
    });
  },
);
