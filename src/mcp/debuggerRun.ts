import z from "zod";
import { spawn } from "child_process";
import getPort from "get-port";

import { yamlContent, server, sessions } from "./server";
import { TcpTransport } from "../dap/transport";
import { DapSession } from "../dap/session";
import { ensureDebugpy } from "../util/debugpy";
import { ensureLLDB, LldbFlavor } from "../util/lldb";
import { getRustSysroot, getRustLldbInitCommands } from "../util/rustc";

server.tool(
  "debuggerRun",
  `
This starts the built-in debugger, which currently supports:
- Python projects
- LLDB (C, C++, Rust, (and Swift on Apple platforms)... plenty of others i'm probably not thinking of)

Use this instead of Bash() or your built-in Shell tools, when wanting to execute the project with the debugger.

A typical flow might look like:
- debuggerRun
- [any debuggerSetBreakpoints you'd like]
- debuggerContinue <-- starts the process
- debuggerWaitUntilBreakpoint

You can also use a non-blocking version of "debuggerWaitUntilBreakpoint" named "debuggerStatus," which
has additional info too. This is useful if you wanna go do other things :0
`,
  {
    type: z
      .enum(["debugpy", "lldb", "lldb-rust", "lldb-swift"])
      .describe(
        `If you're using Rust or Swift, it's still LLDB, but there's some niceties to specifying it in the "type"!`,
      ),
    args: z
      .array(z.string())
      .optional()
      .describe(
        `
If type=debugpy:
Arguments to pass to the Python script starting with either -m or the .py file.

If type=lldb*:
Arguments to start the process. Is NOT processed by Bash so cannot contain variables etc...`,
      ),
    cwd: z
      .string()
      .optional()
      .describe(
        "Working directory for the process. If you leave this blank it'll use the current working directory.",
      ),
  },
  async ({ type, args = [], cwd }) => {
    // Get a free port.
    const host = "127.0.0.1";
    const port = await getPort();

    let child = null as ReturnType<typeof spawn> | null;
    let adapterID: string = "";

    if (type === "debugpy") {
      const { debugpyPath } = await ensureDebugpy();
      const debugpyArgs = [
        "-m",
        "debugpy",
        "--wait-for-client",
        "--listen",
        `${port}`,
        "--configure-subProcess",
        "False",
        ...args,
      ];
      child = spawn("python3", debugpyArgs, {
        cwd: cwd || process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, PYTHONPATH: debugpyPath },
      });
      adapterID = "debugpy";
    } else {
      const flavor = type as LldbFlavor;
      const { lldbDap } = await ensureLLDB(flavor);

      // We don't know the launch target; assume args[0] is the program and rest are program args.
      if (args.length === 0) {
        throw new Error(
          "For lldb*, provide the program to launch as the first argument and its arguments after it.",
        );
      }
      const program = args[0];
      const programArgs = args.slice(1);

      const lldbArgs = [
        "--port",
        String(port),
        "--wait-for-debugger",
        "--launch-target",
        program,
        "--",
        ...programArgs,
      ];

      // Spawn via shell if the command contains spaces (xcrun -f lldb-dap)
      child = spawn(lldbDap, lldbArgs, {
        cwd: cwd || process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
      });
      adapterID = "lldb";
    }

    // Store stdout/stderr buffers temporarily until session is created
    const tempLogs: {
      type: "stdout" | "stderr";
      timestamp: number;
      data: string;
    }[] = [];

    // Handle process output
    child!.stdout?.on("data", (data: Buffer) => {
      const log = {
        type: "stdout" as const,
        timestamp: Date.now(),
        data: data.toString(),
      };
      tempLogs.push(log);
      console.error(`[dap stdout]: ${data.toString()}`);
    });

    child!.stderr?.on("data", (data: Buffer) => {
      const log = {
        type: "stderr" as const,
        timestamp: Date.now(),
        data: data.toString(),
      };
      tempLogs.push(log);
      console.error(`[dap stderr]: ${data.toString()}`);
    });

    child!.on("error", (error: Error) => {
      console.error(`[dap error]: ${error.message}`);
    });

    child!.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
      console.error(`[dap exit]: code=${code}, signal=${signal}`);
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
          child?.kill();
          throw new Error(
            `Failed to connect to debugpy after ${maxRetries} attempts: ${error}`,
          );
        }
      }
    }

    if (!sess || !transport) {
      child?.kill();
      throw new Error("Failed to establish DAP session");
    }

    sessions.add(sess);

    // Store the process reference so we can clean it up later if needed
    sess.process = child || undefined;
    // Store the cwd for relative path resolution in breakpoint commands
    sess.cwd = cwd || process.cwd();

    // Transfer temp logs to session and set up continuous logging
    sess.processLogs = tempLogs;

    // Replace the listeners to log to session instead of temp array
    child!.stdout?.removeAllListeners("data");
    child!.stdout?.on("data", (data: Buffer) => {
      sess.processLogs.push({
        type: "stdout",
        timestamp: Date.now(),
        data: data.toString(),
      });
      console.error(`[dap stdout]: ${data.toString()}`);
    });

    child!.stderr?.removeAllListeners("data");
    child!.stderr?.on("data", (data: Buffer) => {
      sess.processLogs.push({
        type: "stderr",
        timestamp: Date.now(),
        data: data.toString(),
      });
      console.error(`[dap stderr]: ${data.toString()}`);
    });

    try {
      await sess.request("initialize", {
        clientID: "mcp-debugger",
        adapterID,
      });
    } catch (error) {
      console.error("Failed to initialize DAP session:", error);
      sess.close(); // This will also kill the process
      throw new Error(`Failed to initialize DAP session: ${error}`);
    }

    void sess
      .request("attach", {
        connect: { host, port },
      })
      .then(() => {
        sess.started = true;
      })
      .catch((error) => {
        console.error("Failed to attach to debug session:", error);
      });

    // If lldb-rust, emulate rust-lldb helpers by sourcing Rust lldb scripts.
    // https://github.com/helix-editor/helix/wiki/Debugger-Configurations#configuration-for-rust
    if (type === "lldb-rust") {
      try {
        const sysroot = await getRustSysroot();
        const { importCmd, sourceCmd } = getRustLldbInitCommands(sysroot);

        await sess.request("evaluate", {
          expression: importCmd,
          context: "repl",
        });
        await sess.request("evaluate", {
          expression: sourceCmd,
          context: "repl",
        });
      } catch (e) {
        console.error(`[lldb-rust] Failed to source Rust lldb helpers: ${e}`);
      }
    }

    return yamlContent({
      sessionId: sess.id,
    });
  },
);
