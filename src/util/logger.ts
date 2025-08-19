import fs from "fs";
import path from "path";
import { inspect } from "util";

let installed = false;

export type LoggerOptions = {
  file?: string; // path to log file
  maxBytes?: number; // simple rotation threshold
};

function serializeArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  try {
    return JSON.stringify(arg, (_k, v) => {
      if (typeof v === "bigint") return v.toString();
      return v;
    });
  } catch {
    return inspect(arg, { depth: 5, breakLength: 120 });
  }
}

function formatLine(args: unknown[]): string {
  const ts = new Date().toISOString();
  const msg = args.map(serializeArg).join(" ");
  return `${ts} console.error: ${msg}\n`;
}

function ensureDirFor(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function rotateIfNeeded(filePath: string, maxBytes: number) {
  try {
    const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
    if (stat && stat.size > maxBytes) {
      const rotated = `${filePath}.1`;
      try { fs.unlinkSync(rotated); } catch {}
      fs.renameSync(filePath, rotated);
    }
  } catch {}
}

export function installErrorFileLogger(opts: LoggerOptions = {}) {
  if (installed) return;
  installed = true;

  const logPath = opts.file || process.env.MCP_DEBUGGER_LOG || path.join(process.cwd(), "mcp-debugger.log");
  const maxBytes = opts.maxBytes ?? 5 * 1024 * 1024; // 5 MB

  ensureDirFor(logPath);

  const origError = console.error.bind(console);

  console.error = (...args: any[]) => {
    // always print to stderr as before
    try { origError(...args); } catch {}

    // append to file
    try {
      rotateIfNeeded(logPath, maxBytes);
      const line = formatLine(args);
      fs.appendFileSync(logPath, line, { encoding: "utf8" });
    } catch {
      // best-effort logging only
    }
  };
}
