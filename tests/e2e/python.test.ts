import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { resolve } from "path";
import { McpClient, createMcpClient } from "../utils/mcp-client";

const FIXTURE_PATH = resolve(__dirname, "../fixtures/python/simple.py");

describe("Python Debugger (debugpy)", () => {
  let client: McpClient;

  beforeAll(async () => {
    client = createMcpClient();
    await client.start();
  });

  afterAll(async () => {
    await client.stop();
  });

  afterEach(async () => {
    // Clean up any running sessions
    try {
      await client.debuggerTerminate();
    } catch {
      // Ignore errors if no session exists
    }
  });

  describe("Basic debugging", () => {
    it("should start a debug session and hit a breakpoint", async () => {
      // Start the debugger
      const runResult = await client.debuggerRun({
        type: "debugpy",
        args: [FIXTURE_PATH],
      });
      expect(runResult.sessionId).toBeDefined();

      // Set a breakpoint on the add function
      const bpResult = await client.debuggerSetBreakpoints({
        filePath: FIXTURE_PATH,
        breakpoints: [{ old_str: "result = a + b" }],
      });
      expect(bpResult.success).toBe(true);
      expect(bpResult.breakpoints[0].verified).toBe(true);

      // Continue execution (starts the program)
      const contResult = await client.debuggerContinue();
      expect(contResult.success).toBe(true);

      // Wait for breakpoint
      const waitResult = await client.debuggerWaitUntilBreakpoint();
      expect(waitResult.success).toBe(true);
      expect(waitResult.reason).toBe("breakpoint");

      // Check status
      const status = await client.debuggerStatus();
      expect(status.state).toBe("stopped");
      expect(status.stoppedReason).toBe("breakpoint");
    });

    it("should evaluate expressions at a breakpoint", async () => {
      const runResult = await client.debuggerRun({
        type: "debugpy",
        args: [FIXTURE_PATH],
      });
      expect(runResult.sessionId).toBeDefined();

      await client.debuggerSetBreakpoints({
        filePath: FIXTURE_PATH,
        breakpoints: [{ old_str: "result = a + b" }],
      });

      await client.debuggerContinue();
      await client.debuggerWaitUntilBreakpoint();

      // Evaluate expressions
      const evalA = await client.debuggerEval({ expression: "a" });
      expect(evalA.success).toBe(true);
      expect(evalA.result).toBe("5");

      const evalB = await client.debuggerEval({ expression: "b" });
      expect(evalB.success).toBe(true);
      expect(evalB.result).toBe("3");

      const evalSum = await client.debuggerEval({ expression: "a + b" });
      expect(evalSum.success).toBe(true);
      expect(evalSum.result).toBe("8");
    });
  });

  describe("debuggerLogs", () => {
    it("should capture logs from the debugged process", async () => {
      await client.debuggerRun({
        type: "debugpy",
        args: [FIXTURE_PATH],
      });

      // Set a breakpoint after some print statements
      await client.debuggerSetBreakpoints({
        filePath: FIXTURE_PATH,
        breakpoints: [{ old_str: 'print("Finished simple.py")' }],
      });

      await client.debuggerContinue();
      await client.debuggerWaitUntilBreakpoint();

      // Check logs - debugpy captures output, should have some content
      const logs = await client.debuggerLogs();
      expect(logs.output).toBeDefined();
      // The logs should contain some output (either debugpy output or program output)
      expect(logs.output.length).toBeGreaterThan(0);
      // Should have the header indicating logs were retrieved
      expect(logs.output).toContain("Debugger Logs");
    });
  });

  describe("Breakpoint management", () => {
    it("should clear breakpoints and add new ones", async () => {
      await client.debuggerRun({
        type: "debugpy",
        args: [FIXTURE_PATH],
      });

      // Set initial breakpoint
      const bp1 = await client.debuggerSetBreakpoints({
        filePath: FIXTURE_PATH,
        breakpoints: [{ old_str: "result = a + b" }],
      });
      expect(bp1.success).toBe(true);

      // Clear all breakpoints
      const clearResult = await client.debuggerClearBreakpoints({
        filePath: FIXTURE_PATH,
      });
      expect(clearResult.success).toBe(true);

      // Set a different breakpoint
      const bp2 = await client.debuggerSetBreakpoints({
        filePath: FIXTURE_PATH,
        breakpoints: [{ old_str: "result = a * b" }],
      });
      expect(bp2.success).toBe(true);
      expect(bp2.breakpoints[0].verified).toBe(true);

      // Continue and verify we hit the new breakpoint
      await client.debuggerContinue();
      await client.debuggerWaitUntilBreakpoint();

      const status = await client.debuggerStatus();
      expect(status.state).toBe("stopped");
      // Should be in the multiply function, not add
      expect(status.currentFrame?.name).toContain("multiply");
    });
  });

  describe("Stepping", () => {
    it("should step through code with debuggerStep", async () => {
      await client.debuggerRun({
        type: "debugpy",
        args: [FIXTURE_PATH],
      });

      await client.debuggerSetBreakpoints({
        filePath: FIXTURE_PATH,
        breakpoints: [{ old_str: "result = add(5, 3)" }],
      });

      await client.debuggerContinue();
      await client.debuggerWaitUntilBreakpoint();

      const statusBefore = await client.debuggerStatus();
      const lineBefore = statusBefore.currentFrame?.line;

      // Step to next line
      await client.debuggerStep();
      await client.debuggerWaitUntilBreakpoint();

      const statusAfter = await client.debuggerStatus();
      const lineAfter = statusAfter.currentFrame?.line;

      // Should have moved to a different line
      expect(lineAfter).not.toBe(lineBefore);
    });

    it("should step into functions with debuggerStepIn", async () => {
      await client.debuggerRun({
        type: "debugpy",
        args: [FIXTURE_PATH],
      });

      await client.debuggerSetBreakpoints({
        filePath: FIXTURE_PATH,
        breakpoints: [{ old_str: "result = add(5, 3)" }],
      });

      await client.debuggerContinue();
      await client.debuggerWaitUntilBreakpoint();

      // Step into the add function
      await client.debuggerStepIn();
      await client.debuggerWaitUntilBreakpoint();

      const status = await client.debuggerStatus();
      // Should now be inside the add function
      expect(status.currentFrame?.name).toContain("add");
    });
  });

  describe("Conditional breakpoints", () => {
    it("should only break when condition is met", async () => {
      await client.debuggerRun({
        type: "debugpy",
        args: [FIXTURE_PATH],
      });

      // Set conditional breakpoint in the loop
      await client.debuggerSetBreakpoints({
        filePath: FIXTURE_PATH,
        breakpoints: [{ old_str: "total += i", condition: "i == 3" }],
      });

      await client.debuggerContinue();
      await client.debuggerWaitUntilBreakpoint();

      // Check that i is 3
      const evalI = await client.debuggerEval({ expression: "i" });
      expect(evalI.success).toBe(true);
      expect(evalI.result).toBe("3");
    });
  });

  describe("Session termination", () => {
    it("should terminate the debug session", async () => {
      await client.debuggerRun({
        type: "debugpy",
        args: [FIXTURE_PATH],
      });

      const termResult = await client.debuggerTerminate();
      expect(termResult.success).toBe(true);

      // Status should fail or show disconnected
      try {
        await client.debuggerStatus();
        // If it doesn't throw, session might still be cleaning up
      } catch (error) {
        // Expected - no active session
        expect(String(error)).toContain("No active debug session");
      }
    });
  });
});
