import { EventEmitter } from "node:events";
import { TextEncoder, TextDecoder } from "node:util";
import { DapMessage } from "./types";

export class DapWriter {
  private encoder = new TextEncoder();

  write(msg: DapMessage): Buffer {
    const json = JSON.stringify(msg);
    const body = this.encoder.encode(json);
    const header = Buffer.from(
      `Content-Length: ${body.byteLength}\r\n\r\n`,
      "utf8",
    );
    return Buffer.concat([header, Buffer.from(body)]);
  }
}

export class DapReader extends EventEmitter {
  private buffer: Buffer = Buffer.alloc(0);
  private decoder = new TextDecoder();

  push(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this.process();
  }

  private process() {
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;
      const header = this.buffer.subarray(0, headerEnd).toString("utf8");
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) {
        // drop invalid header
        this.buffer = this.buffer.subarray(headerEnd + 4);
        continue;
      }
      const length = parseInt(match[1], 10);
      const total = headerEnd + 4 + length;
      if (this.buffer.length < total) return;
      const body = this.buffer.subarray(headerEnd + 4, total);
      this.buffer = this.buffer.subarray(total);
      try {
        const obj = JSON.parse(this.decoder.decode(body));
        this.emit("message", obj as DapMessage);
      } catch (e) {
        this.emit("error", e);
      }
    }
  }
}
