import { execFile } from "node:child_process";
import { promisify } from "node:util";

const pexecFile = promisify(execFile);

export type LLDBFlavor = "lldb" | "lldb-rust" | "lldb-swift";

async function which(cmd: string) {
  try {
    const { stdout } = await pexecFile(
      process.platform === "win32" ? "where" : "which",
      [cmd],
    );
    const path = stdout.split(/\r?\n/).filter(Boolean)[0];
    return path || null;
  } catch {
    return null;
  }
}

async function xcrunFind(cmd: string) {
  try {
    const { stdout } = await pexecFile("xcrun", ["-f", cmd]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function lldbDapVersion(lldbDap: string) {
  try {
    const { stdout } = await pexecFile(lldbDap, ["--version"]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function lldbDapHelp(lldbDap: string) {
  try {
    const { stdout } = await pexecFile(lldbDap, ["--help"]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function ensureLLDB(flavor: LLDBFlavor) {
  const isMac = process.platform === "darwin";
  let lldbDap = null;

  // If we're using Swift, bias towards "xcrun lldb-dap".
  if (isMac && flavor === "lldb-swift") {
    lldbDap = await xcrunFind("lldb-dap");
  }
  // Try to find lldb-dap on PATH.
  if (!lldbDap) {
    lldbDap = await which("lldb-dap");
  }
  // As a last resort, try to find lldb-dap via xcrun.
  if (isMac && !lldbDap) {
    lldbDap = await xcrunFind("lldb-dap");
  }

  if (!lldbDap) {
    // Provide helpful guidance depending on platform
    throw new Error(
      `lldb-dap not found on PATH${isMac ? " or via xcrun" : ""}.\n` +
        `Install LLDB with DAP support. Guidance:\n` +
        `- macOS: install Xcode 15+ or Command Line Tools; lldb-dap should be available via 'xcrun -f lldb-dap'.\n` +
        `- Linux: install llvm/clang package that includes lldb-dap (e.g., apt install lldb).\n` +
        `- Windows: lldb-dap availability varies; install LLVM toolchain with LLDB-DAP.\n` +
        `(platform: ${process.platform})`,
    );
  }

  // Make sure lldb-dap has Swift support, if the type is Swift.
  if (flavor === "lldb-swift") {
    const version = await lldbDapVersion(lldbDap);
    if (!version || !/Swift/i.test(version)) {
      throw new Error(
        "lldb-dap --version did not include 'Swift'. Ensure you have Xcode Command Line Tools with Swift-enabled LLDB.",
      );
    }
  }

  // Detect if we should use --port or --connection,
  // which differs based on version of LLDB DAP.
  //
  // Reference:
  // https://github.com/llvm/llvm-project/blob/9628061e055c9f695ff80f9a74e4f6e524b34993/lldb/tools/lldb-dap/tool/lldb-dap.cpp#L131
  const help = (await lldbDapHelp(lldbDap)) || "";
  const usePort = /--port/.test(help);
  const useConnection = /--connection/.test(help);

  if (!usePort && !useConnection) {
    throw new Error(
      "lldb-dap does not support --port or --connection. You might be using an outdated version of lldb-dap.",
    );
  }

  return { lldbDap, lldbFeatures: { usePort, useConnection } };
}
