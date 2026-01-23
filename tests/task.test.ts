import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { assert, Server } from "../src/index";

function step(server: Server, at: number): { id: string; version: number } {
  const msgs = server.step({ at });
  expect(msgs.length).toBe(1);
  const value = msgs[0].mesg;
  expect(value.kind).toBe("invoke");
  assert(value.kind === "invoke");
  return value.data.task;
}

let COUNTER = 0;
describe("tasks transitions", () => {
  let server: Server;
  let id: string;
  let at: number;

  beforeEach(() => {
    server = new Server();
    id = `tid${COUNTER++}`;
    at = 0;
    const createRes = server.process({
      at: at++,
      req: {
        kind: "promise.create",
        head: { corrId: "", version: server.version },
        data: {
          id: id,
          param: { headers: {}, data: "" },
          tags: { "resonate:invoke": "default" },
          timeoutAt: Number.MAX_SAFE_INTEGER,
        },
      },
    });
    expect(createRes.kind).not.toBe("error");
  });

  afterEach(() => {
    const settleRes = server.process({
      at,
      req: {
        kind: "promise.settle",
        head: { corrId: "", version: server.version },
        data: { id, state: "resolved", value: { headers: {}, data: "" } },
      },
    });
    expect(settleRes.kind).not.toBe("error");
  });

  test("5: transition from enqueued to claimed via claim", () => {
    const task = step(server, at);
    const res = server.process({
      at: at++,
      req: {
        kind: "task.acquire",
        head: { corrId: "", version: server.version },
        data: {
          id: task.id,
          version: task.version,
          pid: "task5",
          ttl: 5,
        },
      },
    });
    expect(res.kind).toBe("task.acquire");
  });

  test("6: transition from enqueue to enqueue via claim", () => {
    const task = step(server, at);
    const res = server.process({
      at: at++,
      req: {
        kind: "task.acquire",
        head: { corrId: "", version: server.version },
        data: {
          id: task.id,
          version: task.version + 1,
          pid: "task5",
          ttl: 5,
        },
      },
    });
    expect(res.kind).toBe("error");
  });

  test("8: transition from enqueue to enqueue via complete", () => {
    const task = step(server, at);
    const res = server.process({
      at: at++,
      req: {
        kind: "task.suspend",
        head: { corrId: "", version: server.version },
        data: {
          id: task.id,
          version: task.version,
          actions: [],
        },
      },
    });
    expect(res.kind).toBe("error");
  });

  test("10: transition from enqueue to enqueue via heartbeat", () => {
    step(server, at);
    const res = server.process({
      at: at++,
      req: {
        kind: "task.heartbeat",
        head: { corrId: "", version: server.version },
        data: {
          pid: "task10",
          tasks: [],
        },
      },
    });
    expect(res.kind).toBe("task.heartbeat");
    assert(res.kind === "task.heartbeat");
  });

  test("12: transition from claimed to claimed via claim", () => {
    const task = step(server, at);
    const acquireRes = server.process({
      at: at++,
      req: {
        kind: "task.acquire",
        head: { corrId: "", version: server.version },
        data: {
          id: task.id,
          version: task.version,
          pid: "task12",
          ttl: 5,
        },
      },
    });
    expect(acquireRes.kind).not.toBe("error");

    const res = server.process({
      at: at++,
      req: {
        kind: "task.acquire",
        head: { corrId: "", version: server.version },
        data: {
          id: task.id,
          version: task.version,
          pid: "task12",
          ttl: 5,
        },
      },
    });
    expect(res.kind).toBe("error");
  });

  test("13: transition from claimed to init via claim", () => {
    const task = step(server, at);
    const acquireRes = server.process({
      at: at++,
      req: {
        kind: "task.acquire",
        head: { corrId: "", version: server.version },
        data: {
          id: task.id,
          version: task.version,
          pid: "task13",
          ttl: 0,
        },
      },
    });
    expect(acquireRes.kind).not.toBe("error");

    const res = server.process({
      at: at++,
      req: {
        kind: "task.acquire",
        head: { corrId: "", version: server.version },
        data: {
          id: task.id,
          version: task.version,
          pid: "task12",
          ttl: 5,
        },
      },
    });
    expect(res.kind).toBe("error");
  });

  test("14: transition from claimed to completed via complete", () => {
    const task = step(server, at);
    const acquireRes = server.process({
      at: at++,
      req: {
        kind: "task.acquire",
        head: { corrId: "", version: server.version },
        data: {
          id: task.id,
          version: task.version,
          pid: "task14",
          ttl: 5,
        },
      },
    });
    expect(acquireRes.kind).not.toBe("error");

    const res = server.process({
      at: at++,
      req: {
        kind: "task.suspend",
        head: { corrId: "", version: server.version },
        data: {
          id: task.id,
          version: task.version,
          actions: [],
        },
      },
    });
    expect(res.kind).toBe("task.suspend");
  });

  test("15: transition from claimed to init via complete", async () => {
    const task = step(server, at);
    const acquireRes = server.process({
      at: at++,
      req: {
        kind: "task.acquire",
        head: { corrId: "", version: server.version },
        data: {
          id: task.id,
          version: task.version,
          pid: "task15",
          ttl: 0,
        },
      },
    });
    expect(acquireRes.kind).not.toBe("error");

    const res = server.process({
      at: at++,
      req: {
        kind: "task.suspend",
        head: { corrId: "", version: server.version },
        data: {
          id: task.id,
          version: task.version,
          actions: [],
        },
      },
    });
    expect(res.kind).toBe("error");
  });

  test("16: transition from claimed to claimed via complete", () => {
    const task = step(server, at);
    const acquireRes = server.process({
      at: at++,
      req: {
        kind: "task.acquire",
        head: { corrId: "", version: server.version },
        data: {
          id: task.id,
          version: task.version,
          pid: "task16",
          ttl: 5,
        },
      },
    });
    expect(acquireRes.kind).not.toBe("error");

    const res = server.process({
      at: at++,
      req: {
        kind: "task.suspend",
        head: { corrId: "", version: server.version },
        data: {
          id: task.id,
          version: task.version + 1,
          actions: [],
        },
      },
    });
    expect(res.kind).toBe("error");
  });

  test("17: transition from claimed to init via complete (expired)", async () => {
    const task = step(server, at);
    const acquireRes = server.process({
      at: at++,
      req: {
        kind: "task.acquire",
        head: { corrId: "", version: server.version },
        data: {
          id: task.id,
          version: task.version,
          pid: "task17",
          ttl: 0,
        },
      },
    });
    expect(acquireRes.kind).not.toBe("error");

    const res = server.process({
      at: at++,
      req: {
        kind: "task.suspend",
        head: { corrId: "", version: server.version },
        data: {
          id: task.id,
          version: task.version,
          actions: [],
        },
      },
    });
    expect(res.kind).toBe("error");
  });

  test("18: transition from claimed to claimed via heartbeat", () => {
    const task = step(server, at);
    const acquireRes = server.process({
      at: at++,
      req: {
        kind: "task.acquire",
        head: { corrId: "", version: server.version },
        data: {
          id: task.id,
          version: task.version,
          pid: "task18",
          ttl: 5,
        },
      },
    });
    expect(acquireRes.kind).not.toBe("error");

    const res = server.process({
      at: at++,
      req: {
        kind: "task.heartbeat",
        head: { corrId: "", version: server.version },
        data: {
          pid: "task18",
          tasks: [],
        },
      },
    });
    expect(res.kind).toBe("task.heartbeat");
    assert(res.kind === "task.heartbeat");
  });

  test("19: transition from claimed to init via heartbeat", () => {
    const task = step(server, at);
    const acquireRes = server.process({
      at: at++,
      req: {
        kind: "task.acquire",
        head: { corrId: "", version: server.version },
        data: {
          id: task.id,
          version: task.version,
          pid: "task19",
          ttl: 5,
        },
      },
    });
    expect(acquireRes.kind).not.toBe("error");

    const res = server.process({
      at: at++,
      req: {
        kind: "task.heartbeat",
        head: { corrId: "", version: server.version },
        data: {
          pid: "task19",
          tasks: [],
        },
      },
    });
    expect(res.kind).toBe("task.heartbeat");
    assert(res.kind === "task.heartbeat");
  });

  test("20: transition from completed to completed via claim", () => {
    const task = step(server, at);
    const acquireRes = server.process({
      at: at++,
      req: {
        kind: "task.acquire",
        head: { corrId: "", version: server.version },
        data: {
          id: task.id,
          version: task.version,
          pid: "task20",
          ttl: 5,
        },
      },
    });
    expect(acquireRes.kind).not.toBe("error");

    const suspendRes = server.process({
      at: at++,
      req: {
        kind: "task.suspend",
        head: { corrId: "", version: server.version },
        data: {
          id: task.id,
          version: task.version,
          actions: [],
        },
      },
    });
    expect(suspendRes.kind).not.toBe("error");

    const res = server.process({
      at: at++,
      req: {
        kind: "task.acquire",
        head: { corrId: "", version: server.version },
        data: {
          id: task.id,
          version: task.version,
          pid: "task20",
          ttl: 0,
        },
      },
    });
    expect(res.kind).toBe("error");
  });

  test("21: transition from completed to completed via complete", () => {
    const task = step(server, at);
    const acquireRes = server.process({
      at: at++,
      req: {
        kind: "task.acquire",
        head: { corrId: "", version: server.version },
        data: {
          id: task.id,
          version: task.version,
          pid: "task21",
          ttl: 5,
        },
      },
    });
    expect(acquireRes.kind).not.toBe("error");

    const suspendRes = server.process({
      at: at++,
      req: {
        kind: "task.suspend",
        head: { corrId: "", version: server.version },
        data: {
          id: task.id,
          version: task.version,
          actions: [],
        },
      },
    });
    expect(suspendRes.kind).not.toBe("error");

    const res = server.process({
      at: at++,
      req: {
        kind: "task.suspend",
        head: { corrId: "", version: server.version },
        data: {
          id: task.id,
          version: task.version,
          actions: [],
        },
      },
    });
    expect(res.kind).toBe("task.suspend");
  });

  test("22: transition from completed to completed via heartbeat", () => {
    const task = step(server, at);
    const acquireRes = server.process({
      at: at++,
      req: {
        kind: "task.acquire",
        head: { corrId: "", version: server.version },
        data: {
          id: task.id,
          version: task.version,
          pid: "task22",
          ttl: 5,
        },
      },
    });
    expect(acquireRes.kind).not.toBe("error");

    const suspendRes = server.process({
      at: at++,
      req: {
        kind: "task.suspend",
        head: { corrId: "", version: server.version },
        data: {
          id: task.id,
          version: task.version,
          actions: [],
        },
      },
    });
    expect(suspendRes.kind).not.toBe("error");

    const res = server.process({
      at: at++,
      req: {
        kind: "task.heartbeat",
        head: { corrId: "", version: server.version },
        data: {
          pid: "task22",
          tasks: [],
        },
      },
    });
    expect(res.kind).toBe("task.heartbeat");
    assert(res.kind === "task.heartbeat");
  });
});
