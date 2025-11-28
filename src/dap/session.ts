import { EventEmitter } from "node:events";
import { ChildProcess } from "child_process";
import { Transport } from "./transport";
import {
  Request,
  Response,
  Event,
  DapMessage,
  DapCommand,
  RequestArgumentsMap,
  ResponseBodyMap,
} from "./types";

export interface TimestampedEvent extends Event {
  timestamp: number;
}

let sessionCounter = 0;

export interface PendingReq<T = any> {
  resolve: (v: T) => void;
  reject: (e: Error) => void;
  command: string;
}

export class DapSession extends EventEmitter {
  readonly id: string;

  started: boolean = false;
  eventCountAtLastContinue: number | null = null;
  process?: ChildProcess;
  processLogs: {
    type: "stdout" | "stderr";
    timestamp: number;
    data: string;
  }[] = [];
  cwd?: string;

  private seq = 1;
  private pending = new Map<number, PendingReq<any>>();
  private events: TimestampedEvent[] = [];

  constructor(private transport: Transport) {
    super();
    this.id = `s${++sessionCounter}`;
    this.transport.on("message", (m: DapMessage) => this.onMessage(m));
    this.transport.on("stderr", (s: string) => this.emit("stderr", s));
    this.transport.on("exit", (info: { code: number }) =>
      this.emit("exit", info),
    );
  }

  private onMessage(m: DapMessage) {
    if (m.type === "response") {
      const response = m as Response;
      const p = this.pending.get(response.request_seq);
      if (p) {
        this.pending.delete(response.request_seq);
        if (response.success) p.resolve(response.body as any);
        else
          p.reject(new Error(response.message || `DAP error for ${p.command}`));
      }
      return;
    }
    if (m.type === "event") {
      const event = m as Event;
      const timestampedEvent: TimestampedEvent = { ...event, timestamp: Date.now() };
      this.events.push(timestampedEvent);
      this.emit("event", timestampedEvent);
      return;
    }
  }

  request<C extends DapCommand>(
    command: C,
    args: RequestArgumentsMap[C],
  ): Promise<C extends keyof ResponseBodyMap ? ResponseBodyMap[C] : unknown> {
    const request_seq = this.seq++;
    const req: Request<C> = {
      seq: request_seq,
      type: "request",
      command,
      arguments: args,
    };
    return new Promise<any>((resolve, reject) => {
      this.pending.set(request_seq, { resolve, reject, command });
      this.transport.send(req);
    });
  }

  readEvents(
    since: number = 0,
    limit: number = 100,
  ): { events: TimestampedEvent[]; nextSeq: number } {
    const slice = this.events.slice(since, since + limit);
    return { events: slice, nextSeq: since + slice.length };
  }

  close(): void {
    // Terminate the Python process if it exists
    if (this.process) {
      this.process.kill();
      this.process = undefined;
    }
    this.transport.close();
  }
}

export class SessionRegistry {
  private sessions = new Map<string, DapSession>();
  private lastSessionId: string | null = null;

  add(sess: DapSession): void {
    this.sessions.set(sess.id, sess);
    this.lastSessionId = sess.id;
  }
  get(id: string): DapSession | undefined {
    return this.sessions.get(id);
  }
  getLastOrSpecific(id?: string): DapSession | undefined {
    if (id) {
      return this.sessions.get(id);
    }
    if (this.lastSessionId) {
      return this.sessions.get(this.lastSessionId);
    }
    // If no last session, try to get any existing session
    const sessionIds = this.list();
    if (sessionIds.length > 0) {
      return this.sessions.get(sessionIds[sessionIds.length - 1]);
    }
    return undefined;
  }
  delete(id: string): void {
    this.sessions.delete(id);
    if (this.lastSessionId === id) {
      this.lastSessionId = null;
    }
  }
  list(): string[] {
    return Array.from(this.sessions.keys());
  }
}
