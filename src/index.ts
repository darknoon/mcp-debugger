import { runServerStdio } from "./mcp/server";

runServerStdio().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
