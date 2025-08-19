import { spawn } from "node:child_process";

export async function getRustSysroot(): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const p = spawn("rustc", ["--print", "sysroot"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    p.stdout?.on("data", (d: Buffer) => (out += d.toString()));
    p.stderr?.on("data", (d: Buffer) => (err += d.toString()));
    p.on("error", reject);
    p.on("exit", (code) => {
      if (code === 0) resolve(out.trim());
      else reject(new Error(err || "rustc --print sysroot failed"));
    });
  });
}

export function getRustLldbInitCommands(sysroot: string): {
  importCmd: string;
  sourceCmd: string;
} {
  const base = `${sysroot}/lib/rustlib/etc`;
  const lookup = `${base}/lldb_lookup.py`;
  const commands = `${base}/lldb_commands`;
  return {
    importCmd: `command script import "${lookup}"`,
    sourceCmd: `command source -s 0 '${commands}'`,
  };
}
