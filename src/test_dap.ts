import { DapSession } from "./dap/session";
import { TcpTransport } from "./dap/transport";

const transport = new TcpTransport("127.0.0.1", 5678);

const sess = new DapSession(transport);

const body = await sess.request("initialize", {
  adapterID: "mcp-debugger",
});
await sess.request("attach", {
  arguments: {},
});

console.log({ sessionId: sess.id, capabilities: body });
