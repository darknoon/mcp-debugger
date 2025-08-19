import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";

const pexecFile = promisify(execFile);

export type LldbFlavor = "lldb" | "lldb-rust" | "lldb-swift";

export interface EnsureLLDBResult {
  lldbDap: string;
}

async function which(cmd: string): Promise<string | null> {
  try {
    const { stdout } = await pexecFile(
      process.platform === "win32" ? "where" : "which",
      [cmd],
    );
    const path = stdout.toString().split(/\r?\n/).filter(Boolean)[0];
    return path || null;
  } catch {
    return null;
  }
}

async function xcrunFind(cmd: string): Promise<string | null> {
  try {
    const { stdout } = await pexecFile("xcrun", ["-f", cmd]);
    return stdout.toString().trim() || null;
  } catch {
    return null;
  }
}

async function xcrunVersion(tool: string): Promise<string | null> {
  try {
    const { stdout } = await pexecFile("xcrun", [tool, "--version"]);
    return stdout.toString();
  } catch {
    return null;
  }
}

export async function ensureLLDB(
  flavor: LldbFlavor,
): Promise<EnsureLLDBResult> {
  const isMac = process.platform === "darwin";

  if (flavor === "lldb-swift") {
    if (!isMac) {
      throw new Error(
        "Swift debugging is only supported on macOS at the moment.",
      );
    }
    const ver = await xcrunVersion("lldb");
    if (!ver || !/Swift/i.test(ver)) {
      throw new Error(
        "xcrun lldb --version did not include 'Swift'. Ensure you have Xcode Command Line Tools with Swift-enabled LLDB.",
      );
    }
    const path = await xcrunFind("lldb-dap");
    if (!path) {
      throw new Error(
        "Could not locate lldb-dap via xcrun. Install Xcode 15+ or Xcode Command Line Tools that include LLDB-DAP.",
      );
    }
    return { lldbDap: path };
  }

  // Non-swift flavors: prefer lldb-dap on PATH, then xcrun on macOS
  const onPath = await which("lldb-dap");
  if (onPath) {
    return { lldbDap: "lldb-dap" };
  }

  if (isMac) {
    const viaXcrun = await xcrunFind("lldb-dap");
    if (viaXcrun) {
      return { lldbDap: viaXcrun };
    }
  }

  // Provide helpful guidance depending on platform
  const platform = `${process.platform} ${os.release()}`;
  throw new Error(
    `lldb-dap not found on PATH${isMac ? " or via xcrun" : ""}.\n` +
      `Install LLDB with DAP support. Guidance:\n` +
      `- macOS: install Xcode 15+ or Command Line Tools; lldb-dap should be available via 'xcrun -f lldb-dap'.\n` +
      `- Linux: install llvm/clang package that includes lldb-dap (e.g., apt install lldb).\n` +
      `- Windows: lldb-dap availability varies; install LLVM toolchain with LLDB-DAP.\n` +
      `(platform: ${platform})`,
  );
}
