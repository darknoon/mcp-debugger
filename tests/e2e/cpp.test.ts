import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { resolve } from "path";
import { execSync } from "child_process";
import { existsSync, unlinkSync } from "fs";
import { McpClient, createMcpClient } from "../utils/mcp-client";

const FIXTURE_DIR = resolve(__dirname, "../fixtures/cpp");
const SOURCE_PATH = resolve(FIXTURE_DIR, "simple.cpp");
const BINARY_PATH = resolve(FIXTURE_DIR, "simple");

describe("C++ Debugger (LLDB)", () => {
  let client: McpClient;

  beforeAll(async () => {
    // Compile the C++ fixture with debug info
    execSync(`clang++ -g -O0 -o "${BINARY_PATH}" "${SOURCE_PATH}"`, {
      cwd: FIXTURE_DIR,
    });

    client = createMcpClient();
    await client.start();
  });

  afterAll(async () => {
    await client.stop();

    // Clean up compiled binary
    if (existsSync(BINARY_PATH)) {
      unlinkSync(BINARY_PATH);
    }
    // Clean up dSYM on macOS
    const dsymPath = `${BINARY_PATH}.dSYM`;
    if (existsSync(dsymPath)) {
      execSync(`rm -rf "${dsymPath}"`);
    }
  });

  afterEach(async () => {
    try {
      await client.debuggerTerminate();
    } catch {
      // Ignore
    }
  });

  describe("Basic debugging", () => {
    it("should start a debug session and hit a breakpoint", async () => {
      const runResult = await client.debuggerRun({
        type: "lldb",
        args: [BINARY_PATH],
        cwd: FIXTURE_DIR,
      });
      expect(runResult.sessionId).toBeDefined();

      // Set a breakpoint on the add function
      const bpResult = await client.debuggerSetBreakpoints({
        filePath: SOURCE_PATH,
        breakpoints: [{ old_str: "int result = a + b;" }],
      });
      expect(bpResult.success).toBe(true);
      expect(bpResult.breakpoints[0].verified).toBe(true);

      await client.debuggerContinue();
      const waitResult = await client.debuggerWaitUntilBreakpoint();
      expect(waitResult.success).toBe(true);
      expect(waitResult.reason).toBe("breakpoint");

      const status = await client.debuggerStatus();
      expect(status.state).toBe("stopped");
    });

    it("should evaluate expressions at a breakpoint", async () => {
      await client.debuggerRun({
        type: "lldb",
        args: [BINARY_PATH],
        cwd: FIXTURE_DIR,
      });

      await client.debuggerSetBreakpoints({
        filePath: SOURCE_PATH,
        breakpoints: [{ old_str: "int result = a + b;" }],
      });

      await client.debuggerContinue();
      await client.debuggerWaitUntilBreakpoint();

      const evalA = await client.debuggerEval({ expression: "a" });
      expect(evalA.success).toBe(true);
      expect(evalA.result).toContain("5");

      const evalB = await client.debuggerEval({ expression: "b" });
      expect(evalB.success).toBe(true);
      expect(evalB.result).toContain("3");
    });
  });

  describe("debuggerLogs", () => {
    it("should capture logs from the debugged process", async () => {
      await client.debuggerRun({
        type: "lldb",
        args: [BINARY_PATH],
        cwd: FIXTURE_DIR,
      });

      await client.debuggerSetBreakpoints({
        filePath: SOURCE_PATH,
        breakpoints: [{ old_str: 'std::cout << "Finished simple.cpp"' }],
      });

      await client.debuggerContinue();
      await client.debuggerWaitUntilBreakpoint();

      const logs = await client.debuggerLogs();
      expect(logs.output).toBeDefined();
      expect(logs.output.length).toBeGreaterThan(0);
      expect(logs.output).toContain("Debugger Logs");
    });
  });

  describe("Breakpoint management", () => {
    it("should clear breakpoints and add new ones", async () => {
      await client.debuggerRun({
        type: "lldb",
        args: [BINARY_PATH],
        cwd: FIXTURE_DIR,
      });

      const bp1 = await client.debuggerSetBreakpoints({
        filePath: SOURCE_PATH,
        breakpoints: [{ old_str: "int result = a + b;" }],
      });
      expect(bp1.success).toBe(true);

      const clearResult = await client.debuggerClearBreakpoints({
        filePath: SOURCE_PATH,
      });
      expect(clearResult.success).toBe(true);

      const bp2 = await client.debuggerSetBreakpoints({
        filePath: SOURCE_PATH,
        breakpoints: [{ old_str: "int result = a * b;" }],
      });
      expect(bp2.success).toBe(true);

      await client.debuggerContinue();
      await client.debuggerWaitUntilBreakpoint();

      const status = await client.debuggerStatus();
      expect(status.state).toBe("stopped");
      expect(status.currentFrame?.name).toContain("multiply");
    });
  });

  describe("Stepping", () => {
    it("should step through code with debuggerStep", async () => {
      await client.debuggerRun({
        type: "lldb",
        args: [BINARY_PATH],
        cwd: FIXTURE_DIR,
      });

      await client.debuggerSetBreakpoints({
        filePath: SOURCE_PATH,
        breakpoints: [{ old_str: "int result = add(5, 3);" }],
      });

      await client.debuggerContinue();
      await client.debuggerWaitUntilBreakpoint();

      const statusBefore = await client.debuggerStatus();
      const lineBefore = statusBefore.currentFrame?.line;

      await client.debuggerStep();
      await client.debuggerWaitUntilBreakpoint();

      const statusAfter = await client.debuggerStatus();
      const lineAfter = statusAfter.currentFrame?.line;

      expect(lineAfter).not.toBe(lineBefore);
    });

    it("should step into functions with debuggerStepIn", async () => {
      await client.debuggerRun({
        type: "lldb",
        args: [BINARY_PATH],
        cwd: FIXTURE_DIR,
      });

      await client.debuggerSetBreakpoints({
        filePath: SOURCE_PATH,
        breakpoints: [{ old_str: "int result = add(5, 3);" }],
      });

      await client.debuggerContinue();
      await client.debuggerWaitUntilBreakpoint();

      await client.debuggerStepIn();
      await client.debuggerWaitUntilBreakpoint();

      const status = await client.debuggerStatus();
      expect(status.currentFrame?.name).toContain("add");
    });
  });

  describe("Conditional breakpoints", () => {
    it("should only break when condition is met", async () => {
      await client.debuggerRun({
        type: "lldb",
        args: [BINARY_PATH],
        cwd: FIXTURE_DIR,
      });

      await client.debuggerSetBreakpoints({
        filePath: SOURCE_PATH,
        breakpoints: [{ old_str: "total += i;", condition: "i == 3" }],
      });

      await client.debuggerContinue();
      await client.debuggerWaitUntilBreakpoint();

      const evalI = await client.debuggerEval({ expression: "i" });
      expect(evalI.success).toBe(true);
      expect(evalI.result).toContain("3");
    });
  });

  describe("Session termination", () => {
    it("should terminate the debug session", async () => {
      await client.debuggerRun({
        type: "lldb",
        args: [BINARY_PATH],
        cwd: FIXTURE_DIR,
      });

      const termResult = await client.debuggerTerminate();
      expect(termResult.success).toBe(true);
    });
  });
});
