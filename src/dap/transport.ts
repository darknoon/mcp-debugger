import { EventEmitter } from "node:events";
import * as net from "node:net";

import { DapReader, DapWriter } from "./wire";
import { DapMessage } from "./types";

export interface Transport extends EventEmitter {
  send(msg: DapMessage): void;
  close(): void;
}

export class TcpTransport extends EventEmitter implements Transport {
  private socket!: net.Socket;
  private reader = new DapReader();
  private writer = new DapWriter();

  constructor(
    private host: string,
    private port: number,
  ) {
    super();
    this.start();
  }

  private start() {
    this.socket = net.createConnection({ host: this.host, port: this.port });
    this.socket.on("connect", () => this.emit("connect"));
    this.socket.on("data", (chunk) => this.reader.push(chunk));
    this.socket.on("error", (e) => this.emit("error", e));
    this.socket.on("close", (hadErr) =>
      this.emit("exit", { code: hadErr ? 1 : 0 }),
    );

    this.reader.on("message", (m: DapMessage) => {
      console.error("RECV:" + JSON.stringify(m, null, 2));
      this.emit("message", m);
    });
    this.reader.on("error", (e) => this.emit("error", e));
  }

  send(msg: DapMessage): void {
    console.error("SEND:" + JSON.stringify(msg, null, 2));
    const buf = this.writer.write(msg);
    this.socket.write(buf);
  }

  close(): void {
    try {
      this.socket.end();
    } catch {}
    try {
      this.socket.destroy();
    } catch {}
  }
}
