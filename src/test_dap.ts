import { DapSession } from "./dap/session";
import { TcpTransport } from "./dap/transport";

async function main() {
  const transport = new TcpTransport("127.0.0.1", 5678);

  const sess = new DapSession(transport);

  const body = await sess.request("initialize", {
    clientID: "mcp-debugger",
    adapterID: "debugpy",
  });

  await Promise.all([
    sess.request("attach", {
      connect: {
        host: "127.0.0.1",
        port: 5678,
      },
    }),
    sess.request("configurationDone"),
  ]);

  console.error({ sessionId: sess.id, capabilities: body });
}

main().catch(console.error);
