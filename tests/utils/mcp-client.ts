import { spawn, ChildProcess } from "child_process";
import { resolve } from "path";
import * as YAML from "yaml";

const PROJECT_ROOT = resolve(__dirname, "../..");

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface DebuggerRunParams {
  type: "debugpy" | "lldb" | "lldb-rust" | "lldb-swift";
  args?: string[];
  cwd?: string;
}

export interface Breakpoint {
  old_str: string;
  condition?: string;
  hitCondition?: string;
  logMessage?: string;
}

export interface SetBreakpointsParams {
  sessionId?: string;
  filePath: string;
  breakpoints: Breakpoint[];
}

export interface ClearBreakpointsParams {
  sessionId?: string;
  filePath: string;
}

export interface SessionParams {
  sessionId?: string;
}

export interface StepParams {
  sessionId?: string;
  threadId?: number;
}

export interface EvalParams {
  sessionId?: string;
  expression: string;
  frameId?: number;
}

export interface WaitParams {
  sessionId?: string;
  timeout?: number;
}

export interface LogsParams {
  sessionId?: string;
  since?: number;
  limit?: number;
  type?: "all" | "stdout" | "stderr";
}

export class McpClient {
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private buffer = "";
  private initialized = false;

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.process = spawn("bun", ["run", "src/index.ts"], {
        cwd: PROJECT_ROOT,
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.process.stdout?.on("data", (data: Buffer) => {
        this.handleData(data.toString());
      });

      this.process.stderr?.on("data", (data: Buffer) => {
        // Log stderr for debugging but don't treat as error
        // The MCP server logs to stderr
        console.error("[MCP stderr]:", data.toString());
      });

      this.process.on("error", (error) => {
        reject(error);
      });

      this.process.on("exit", (code) => {
        if (!this.initialized) {
          reject(new Error(`MCP server exited with code ${code}`));
        }
      });

      // Give the server a moment to start
      setTimeout(async () => {
        try {
          await this.initialize();
          this.initialized = true;
          resolve();
        } catch (error) {
          reject(error);
        }
      }, 500);
    });
  }

  private handleData(data: string): void {
    this.buffer += data;

    // Parse JSON-RPC messages (newline-delimited JSON)
    while (true) {
      const newlineIndex = this.buffer.indexOf("\n");
      if (newlineIndex === -1) break;

      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);

      if (!line) continue;

      try {
        const message = JSON.parse(line) as JsonRpcResponse;
        this.handleMessage(message);
      } catch (error) {
        // Not JSON, might be debug output - ignore
      }
    }
  }

  private handleMessage(message: JsonRpcResponse): void {
    const pending = this.pendingRequests.get(message.id);
    if (pending) {
      this.pendingRequests.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message));
      } else {
        pending.resolve(message.result);
      }
    }
  }

  private async sendRequest(
    method: string,
    params?: Record<string, unknown>
  ): Promise<unknown> {
    if (!this.process?.stdin) {
      throw new Error("MCP client not started");
    }

    const id = ++this.requestId;
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    const message = JSON.stringify(request) + "\n";

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.process!.stdin!.write(message);

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${method} timed out`));
        }
      }, 30000);
    });
  }

  private async initialize(): Promise<void> {
    await this.sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "test-client",
        version: "1.0.0",
      },
    });
  }

  async callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const result = (await this.sendRequest("tools/call", {
      name,
      arguments: args,
    })) as { content: Array<{ type: string; text: string }> };
    return result;
  }

  // Helper to parse YAML response from tool
  parseToolResult<T>(result: {
    content: Array<{ type: string; text: string }>;
  }): T {
    const text = result.content[0]?.text;
    if (!text) {
      throw new Error("Empty tool result");
    }
    return YAML.parse(text) as T;
  }

  // Typed tool helpers

  async debuggerRun(
    params: DebuggerRunParams
  ): Promise<{ sessionId: string }> {
    const result = await this.callTool("debuggerRun", params);
    return this.parseToolResult(result);
  }

  async debuggerTerminate(params: SessionParams = {}): Promise<{
    success: boolean;
    message: string;
  }> {
    const result = await this.callTool("debuggerTerminate", params);
    return this.parseToolResult(result);
  }

  async debuggerContinue(params: SessionParams = {}): Promise<{
    success: boolean;
    response: unknown;
  }> {
    const result = await this.callTool("debuggerContinue", params);
    return this.parseToolResult(result);
  }

  async debuggerSetBreakpoints(params: SetBreakpointsParams): Promise<{
    success: boolean;
    filePath: string;
    breakpointLines: Array<{
      line: number;
      searchString: string;
      condition?: string;
      hitCondition?: string;
      logMessage?: string;
    }>;
    breakpoints: Array<{
      id?: number;
      verified: boolean;
      line?: number;
      message?: string;
    }>;
  }> {
    const result = await this.callTool("debuggerSetBreakpoints", params);
    return this.parseToolResult(result);
  }

  async debuggerClearBreakpoints(params: ClearBreakpointsParams): Promise<{
    success: boolean;
    filePath: string;
    message: string;
  }> {
    const result = await this.callTool("debuggerClearBreakpoints", params);
    return this.parseToolResult(result);
  }

  async debuggerStatus(params: SessionParams = {}): Promise<{
    sessionId: string;
    started: boolean;
    state: "not_started" | "running" | "stopped" | "terminated" | "disconnected";
    threads?: Array<{ id: number; name: string }>;
    stoppedReason?: string;
    stoppedThreadId?: number;
    stackTrace?: Array<{
      id: number;
      name: string;
      line: number;
      column: number;
      source?: { path: string };
    }>;
    currentFrame?: {
      id: number;
      name: string;
      line: number;
      source?: { path: string };
    };
    scopes?: Array<{
      name: string;
      variables: Array<{
        name: string;
        value: string;
        type?: string;
      }>;
    }>;
    sourceContext?: {
      file: string;
      currentLine: number;
      lines: Array<{ number: number; content: string; current: boolean }>;
    };
    exitCode?: number;
    message?: string;
    error?: string;
  }> {
    const result = await this.callTool("debuggerStatus", params);
    return this.parseToolResult(result);
  }

  async debuggerStep(params: StepParams = {}): Promise<{
    success: boolean;
    threadId: number;
    response: unknown;
  }> {
    const result = await this.callTool("debuggerStep", params);
    return this.parseToolResult(result);
  }

  async debuggerStepIn(params: StepParams = {}): Promise<{
    success: boolean;
    threadId: number;
    response: unknown;
  }> {
    const result = await this.callTool("debuggerStepIn", params);
    return this.parseToolResult(result);
  }

  async debuggerEval(params: EvalParams): Promise<{
    success: boolean;
    result?: string;
    type?: string;
    variablesReference?: number;
    error?: string;
    expression?: string;
  }> {
    const result = await this.callTool("debuggerEval", params);
    return this.parseToolResult(result);
  }

  async debuggerWaitUntilBreakpoint(params: WaitParams = {}): Promise<{
    success: boolean;
    reason: string;
    elapsed: number;
    threadId?: number;
    hitBreakpointIds?: number[];
    description?: string;
    alreadyStopped?: boolean;
    message?: string;
  }> {
    const result = await this.callTool("debuggerWaitUntilBreakpoint", {
      timeout: 30000,
      ...params,
    });
    return this.parseToolResult(result);
  }

  async debuggerLogs(params: LogsParams = {}): Promise<{
    output: string;
  }> {
    const result = await this.callTool("debuggerLogs", params);
    return this.parseToolResult(result);
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.pendingRequests.clear();
    this.buffer = "";
    this.initialized = false;
  }
}

// Create a shared client instance for tests
export function createMcpClient(): McpClient {
  return new McpClient();
}
