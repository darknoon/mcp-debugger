import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { resolve } from "path";
import { execSync } from "child_process";
import { existsSync } from "fs";
import { McpClient, createMcpClient } from "../utils/mcp-client";

const FIXTURE_DIR = resolve(__dirname, "../fixtures/rust/simple");
const SOURCE_PATH = resolve(FIXTURE_DIR, "src/main.rs");
const BINARY_PATH = resolve(FIXTURE_DIR, "target/debug/simple");

describe("Rust Debugger (LLDB)", () => {
  let client: McpClient;

  beforeAll(async () => {
    // Build the Rust fixture with debug info
    execSync("cargo build", {
      cwd: FIXTURE_DIR,
      stdio: "inherit",
    });

    if (!existsSync(BINARY_PATH)) {
      throw new Error(`Rust binary not found at ${BINARY_PATH}`);
    }

    client = createMcpClient();
    await client.start();
  });

  afterAll(async () => {
    await client.stop();
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
        type: "lldb-rust",
        args: [BINARY_PATH],
        cwd: FIXTURE_DIR,
      });
      expect(runResult.sessionId).toBeDefined();

      // Set a breakpoint on the add function
      const bpResult = await client.debuggerSetBreakpoints({
        filePath: SOURCE_PATH,
        breakpoints: [{ old_str: "let result = a + b;" }],
      });
      expect(bpResult.success).toBe(true);
      expect(bpResult.breakpoints[0].verified).toBe(true);

      await client.debuggerContinue();
      const waitResult = await client.debuggerWaitUntilBreakpoint();
      expect(waitResult.success).toBe(true);
      expect(waitResult.reason).toBe("breakpoint");

      // waitUntilBreakpoint success confirms we're stopped
      const status = await client.debuggerStatus();
      expect(status.sessionId).toBeDefined();
    });

    it("should evaluate expressions at a breakpoint", async () => {
      await client.debuggerRun({
        type: "lldb-rust",
        args: [BINARY_PATH],
        cwd: FIXTURE_DIR,
      });

      await client.debuggerSetBreakpoints({
        filePath: SOURCE_PATH,
        breakpoints: [{ old_str: "let result = a + b;" }],
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

  describe("Rust string visualization", () => {
    it("should display string contents not memory addresses (rust-lldb helpers)", async () => {
      // This test verifies that the rust-lldb helper scripts are loaded correctly
      // Without them, string variables would show as memory addresses like 0x...
      // With them, we should see actual string content like "hello"
      // See: https://github.com/helix-editor/helix/wiki/Debugger-Configurations#configuration-for-rust
      await client.debuggerRun({
        type: "lldb-rust",
        args: [BINARY_PATH],
        cwd: FIXTURE_DIR,
      });

      // Set breakpoint after string variables are initialized
      await client.debuggerSetBreakpoints({
        filePath: SOURCE_PATH,
        breakpoints: [{ old_str: 'println!("{}", combined);' }],
      });

      await client.debuggerContinue();
      await client.debuggerWaitUntilBreakpoint();

      // Evaluate the &str variable - should show "hello" not just a pointer
      const evalGreeting = await client.debuggerEval({ expression: "greeting" });
      expect(evalGreeting.success).toBe(true);
      // Should contain the actual string content "hello", not just a memory address
      expect(evalGreeting.result).toContain("hello");

      // Evaluate the String variable - should show "world" not just a pointer
      const evalName = await client.debuggerEval({ expression: "name" });
      expect(evalName.success).toBe(true);
      // Should contain the actual string content "world"
      expect(evalName.result).toContain("world");

      // Evaluate the combined String - should show the formatted content
      const evalCombined = await client.debuggerEval({ expression: "combined" });
      expect(evalCombined.success).toBe(true);
      // Should contain "hello" and "world" from the format!() call
      expect(evalCombined.result).toContain("hello");
      expect(evalCombined.result).toContain("world");
    });
  });

  describe("debuggerLogs", () => {
    it("should capture logs from the debugged process", async () => {
      await client.debuggerRun({
        type: "lldb-rust",
        args: [BINARY_PATH],
        cwd: FIXTURE_DIR,
      });

      await client.debuggerSetBreakpoints({
        filePath: SOURCE_PATH,
        breakpoints: [{ old_str: 'println!("Finished simple.rs");' }],
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
        type: "lldb-rust",
        args: [BINARY_PATH],
        cwd: FIXTURE_DIR,
      });

      const bp1 = await client.debuggerSetBreakpoints({
        filePath: SOURCE_PATH,
        breakpoints: [{ old_str: "let result = a + b;" }],
      });
      expect(bp1.success).toBe(true);

      const clearResult = await client.debuggerClearBreakpoints({
        filePath: SOURCE_PATH,
      });
      expect(clearResult.success).toBe(true);

      const bp2 = await client.debuggerSetBreakpoints({
        filePath: SOURCE_PATH,
        breakpoints: [{ old_str: "let result = a * b;" }],
      });
      expect(bp2.success).toBe(true);

      await client.debuggerContinue();
      const waitResult = await client.debuggerWaitUntilBreakpoint();
      expect(waitResult.success).toBe(true);

      // Rust symbols follow pattern: module::function::hash
      const status = await client.debuggerStatus();
      expect(status.currentFrame).toBeDefined();
      expect(status.currentFrame!.name).toMatch(/simple::multiply::/);
    });
  });

  describe("Stepping", () => {
    it("should step through code with debuggerStep", async () => {
      await client.debuggerRun({
        type: "lldb-rust",
        args: [BINARY_PATH],
        cwd: FIXTURE_DIR,
      });

      await client.debuggerSetBreakpoints({
        filePath: SOURCE_PATH,
        breakpoints: [{ old_str: "let result = add(5, 3);" }],
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
        type: "lldb-rust",
        args: [BINARY_PATH],
        cwd: FIXTURE_DIR,
      });

      await client.debuggerSetBreakpoints({
        filePath: SOURCE_PATH,
        breakpoints: [{ old_str: "let result = add(5, 3);" }],
      });

      await client.debuggerContinue();
      await client.debuggerWaitUntilBreakpoint();

      await client.debuggerStepIn();
      await client.debuggerWaitUntilBreakpoint();

      const status = await client.debuggerStatus();
      // Rust symbols follow pattern: module::function::hash
      expect(status.currentFrame).toBeDefined();
      expect(status.currentFrame!.name).toMatch(/simple::add::/);
    });
  });

  describe("Conditional breakpoints", () => {
    it("should only break when condition is met", async () => {
      await client.debuggerRun({
        type: "lldb-rust",
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
        type: "lldb-rust",
        args: [BINARY_PATH],
        cwd: FIXTURE_DIR,
      });

      const termResult = await client.debuggerTerminate();
      expect(termResult.success).toBe(true);
    });
  });
});
