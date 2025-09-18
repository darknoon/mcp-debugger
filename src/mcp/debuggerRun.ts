import z from "zod";
import { ChildProcess, spawn } from "child_process";
import getPort from "get-port";

import { yamlContent, server, sessions } from "./server";

import { TcpTransport } from "../dap/transport";
import { DapSession } from "../dap/session";

import { ensureDebugpy } from "../util/debugpy";
import { ensureLLDB } from "../util/lldb";
import { ensureRustCompiler } from "../util/rustc";

const DebuggerTypeSchema = z.enum([
  "debugpy",
  "lldb",
  "lldb-rust",
  "lldb-swift",
]);
type DebuggerType = z.infer<typeof DebuggerTypeSchema>;

function isTypeDebugpy(type: DebuggerType): type is "debugpy" {
  return type === "debugpy";
}

function isTypeLLDB(
  type: DebuggerType,
): type is "lldb" | "lldb-rust" | "lldb-swift" {
  return type === "lldb" || type === "lldb-rust" || type === "lldb-swift";
}

enum DAPRequestType {
  LAUNCH,
  ATTACH,
}

async function spawnDebugger(
  debuggerType: DebuggerType,
  opts: {
    cwd: string | undefined;
    program: string;
    programArgs: string[];
    host: string;
    port: number;
  },
): Promise<{
  child: ChildProcess;
  adapterID: string;
  initialRequestType: DAPRequestType;
}> {
  const { cwd, program, programArgs, host, port } = opts;

  if (isTypeDebugpy(debuggerType)) {
    const { debugpyPath } = await ensureDebugpy();
    const debugpyArgs = [
      "-m",
      "debugpy",
      "--wait-for-client",
      "--listen",
      `${port}`,
      "--configure-subProcess",
      "False",
      program,
      ...programArgs,
    ];

    const child = spawn("python3", debugpyArgs, {
      cwd: cwd || process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PYTHONPATH: debugpyPath },
    });

    return {
      child,
      adapterID: "debugpy",
      initialRequestType: DAPRequestType.ATTACH,
    };
  }

  if (isTypeLLDB(debuggerType)) {
    const { lldbDap, lldbFeatures } = await ensureLLDB(debuggerType);
    const lldbArgs = lldbFeatures.usePort
      ? ["--port", String(port)]
      : lldbFeatures.useConnection
        ? ["--connection", `listen://${host}:${port}`]
        : [];

    const child = spawn(lldbDap, lldbArgs, {
      cwd: cwd || process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    return {
      child,
      adapterID: "lldb-dap",
      initialRequestType: DAPRequestType.LAUNCH,
    };
  }

  throw new Error("Unsupported debugger type");
}

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
    if (args.length === 0) {
      throw new Error("No arguments provided");
    }

    const [program, ...programArgs] = args;
    const host = "127.0.0.1";
    const port = await getPort();

    const { child, adapterID, initialRequestType } = await spawnDebugger(type, {
      cwd,
      program,
      programArgs,
      host,
      port,
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
    sess.processLogs = [];

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

    if (initialRequestType == DAPRequestType.ATTACH) {
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
    } else if (initialRequestType == DAPRequestType.LAUNCH) {
      void sess.request("launch", {
        program,
        args: programArgs,
        cwd: cwd || process.cwd(),
      });
    }

    // If lldb-rust, emulate rust-lldb helpers by sourcing Rust lldb scripts.
    //
    // Reference:
    // https://github.com/helix-editor/helix/wiki/Debugger-Configurations#configuration-for-rust
    if (type === "lldb-rust") {
      try {
        const {
          rustLLDBInitCommands: { importCmd, sourceCmd },
        } = await ensureRustCompiler();

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
