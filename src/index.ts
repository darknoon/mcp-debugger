import { runServerStdio } from "./mcp/server";

import "./mcp/debuggerRun";
import "./mcp/debuggerTerminate";
import "./mcp/debuggerContinue";
import "./mcp/debuggerSetBreakpoints";
import "./mcp/debuggerClearBreakpoints";
import "./mcp/debuggerStatus";
import "./mcp/debuggerStep";
import "./mcp/debuggerStepIn";
import "./mcp/debuggerStepOut";
import "./mcp/debuggerEval";
import "./mcp/debuggerWaitUntilBreakpoint";
import "./mcp/debuggerLogs";

runServerStdio().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
