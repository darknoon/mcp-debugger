import { execFile } from "node:child_process";
import { promisify } from "node:util";

const pexecFile = promisify(execFile);

export async function ensureRustCompiler() {
  const { stdout } = await pexecFile("rustc", ["--print", "sysroot"]);

  const rustSysroot = stdout.trim();
  const rustEtc = `${rustSysroot}/lib/rustlib/etc`;
  const lookup = `${rustEtc}/lldb_lookup.py`;
  const commands = `${rustEtc}/lldb_commands`;

  return {
    rustSysroot,
    rustLLDBInitCommands: {
      importCmd: `command script import "${lookup}"`,
      sourceCmd: `command source -s 0 '${commands}'`,
    },
  };
}
