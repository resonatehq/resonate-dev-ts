import { describe, expect, test } from "bun:test";
import { Server } from "../src";
import { assert, isStatus } from "../src/utils";

function createPromise(
  server: Server,
  id: string,
  at: number,
  opts: {
    timeoutAt?: number;
    tags?: { [key: string]: string };
  } = {},
) {
  return server.process({
    at,
    req: {
      kind: "promise.create",
      head: { corrId: "", version: server.version },
      data: {
        id,
        param: { headers: {}, data: "" },
        tags: opts.tags ?? {},
        timeoutAt: opts.timeoutAt ?? Number.MAX_SAFE_INTEGER,
      },
    },
  });
}

function createPromiseWithTask(
  server: Server,
  id: string,
  at: number,
): { id: string; version: number } {
  createPromise(server, id, at, { tags: { "resonate:invoke": "default" } });
  const msgs = server.step({ at });
  expect(msgs.length).toBe(1);
  const mesg = msgs[0].mesg;
  expect(mesg.kind).toBe("invoke");
  assert(mesg.kind === "invoke");
  return mesg.data.task;
}

function settlePromise(server: Server, id: string, at: number): void {
  server.process({
    at,
    req: {
      kind: "promise.settle",
      head: { corrId: "", version: server.version },
      data: { id, state: "resolved", value: { headers: {}, data: "" } },
    },
  });
}

function acquireTask(
  server: Server,
  taskId: string,
  version: number,
  at: number,
) {
  return server.process({
    at,
    req: {
      kind: "task.acquire",
      head: { corrId: "", version: server.version },
      data: { id: taskId, version, pid: "worker1", ttl: 5000 },
    },
  });
}

function suspendTask(
  server: Server,
  taskId: string,
  version: number,
  at: number,
  actions: Array<{
    kind: "promise.register";
    head: { corrId: string; version: string };
    data: { awaiter: string; awaited: string };
  }> = [],
) {
  return server.process({
    at,
    req: {
      kind: "task.suspend",
      head: { corrId: "", version: server.version },
      data: { id: taskId, version, actions },
    },
  });
}

function fulfillTask(
  server: Server,
  taskId: string,
  version: number,
  promiseId: string,
  at: number,
) {
  return server.process({
    at,
    req: {
      kind: "task.fulfill",
      head: { corrId: "", version: server.version },
      data: {
        id: taskId,
        version,
        action: {
          kind: "promise.settle",
          head: { corrId: "", version: server.version },
          data: {
            id: promiseId,
            state: "resolved",
            value: { headers: {}, data: "" },
          },
        },
      },
    },
  });
}

function releaseTask(
  server: Server,
  taskId: string,
  version: number,
  at: number,
) {
  return server.process({
    at,
    req: {
      kind: "task.release",
      head: { corrId: "", version: server.version },
      data: { id: taskId, version },
    },
  });
}

function fenceTask(
  server: Server,
  taskId: string,
  version: number,
  at: number,
) {
  return server.process({
    at,
    req: {
      kind: "task.fence",
      head: { corrId: "", version: server.version },
      data: {
        id: taskId,
        version,
        action: {
          kind: "promise.create",
          head: { corrId: "", version: server.version },
          data: {
            id: "child",
            param: { headers: {}, data: "" },
            tags: {},
            timeoutAt: Number.MAX_SAFE_INTEGER,
          },
        },
      },
    },
  });
}

function heartbeatTask(
  server: Server,
  pid: string,
  tasks: Array<{ id: string; version: number }>,
  at: number,
) {
  return server.process({
    at,
    req: {
      kind: "task.heartbeat",
      head: { corrId: "", version: server.version },
      data: { pid, tasks },
    },
  });
}

describe("TaskGet() Transitions", () => {
  test("1 -> TaskGet() | ⊥ → ⊥ | 404", () => {
    const server = new Server();
    const res = server.process({
      at: 0,
      req: {
        kind: "task.get",
        head: { corrId: "", version: server.version },
        data: { id: "nonexistent" },
      },
    });
    assert(res.kind === "task.get");
    assert(isStatus(res, 404));
  });

  test("2 -> TaskGet() | ⟨p, e, l, v, c, R⟩ → same | 200", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    const res = server.process({
      at: 1,
      req: {
        kind: "task.get",
        head: { corrId: "", version: server.version },
        data: { id: task.id },
      },
    });
    assert(res.kind === "task.get");
    assert(isStatus(res, 200));
    settlePromise(server, "p1", 2);
  });

  test("3 -> TaskGet() | ⟨a, e, l, v, c, R⟩ → same | 200", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    const res = server.process({
      at: 2,
      req: {
        kind: "task.get",
        head: { corrId: "", version: server.version },
        data: { id: task.id },
      },
    });
    assert(res.kind === "task.get");
    assert(isStatus(res, 200));
    settlePromise(server, "p1", 3);
  });

  test("4 -> TaskGet() | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ → same | 200", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    suspendTask(server, task.id, task.version, 2);
    const res = server.process({
      at: 3,
      req: {
        kind: "task.get",
        head: { corrId: "", version: server.version },
        data: { id: task.id },
      },
    });
    assert(res.kind === "task.get");
    assert(isStatus(res, 200));
    settlePromise(server, "p1", 4);
  });

  test("5 -> TaskGet() | ⟨f, ⊥, ⊥, ⊥, ⊥, ∅⟩ → same | 200", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    fulfillTask(server, task.id, task.version, "p1", 2);
    const res = server.process({
      at: 3,
      req: {
        kind: "task.get",
        head: { corrId: "", version: server.version },
        data: { id: task.id },
      },
    });
    assert(res.kind === "task.get");
    assert(isStatus(res, 200));
  });
});

describe("TaskCreate(t, l) Transitions", () => {
  test("6 -> TaskCreate | ⊥ → ⟨a, t+l, l, 0, Invoke, ∅⟩ | 200", () => {
    const server = new Server();
    const res = server.process({
      at: 0,
      req: {
        kind: "task.create",
        head: { corrId: "", version: server.version },
        data: {
          pid: "worker1",
          ttl: 5000,
          action: {
            kind: "promise.create",
            head: { corrId: "", version: server.version },
            data: {
              id: "p1",
              param: { headers: {}, data: "" },
              tags: { "resonate:invoke": "default" },
              timeoutAt: Number.MAX_SAFE_INTEGER,
            },
          },
        },
      },
    });
    assert(res.kind === "task.create");
    assert(isStatus(res, 200));
    expect(res.data.task).toBeDefined();
    settlePromise(server, "p1", 1);
  });

  test("7 -> TaskCreate | ⟨p, e, l, v, c, R⟩ → same | 200 (idempotent)", () => {
    const server = new Server();
    createPromiseWithTask(server, "p1", 0);
    const res = server.process({
      at: 1,
      req: {
        kind: "task.create",
        head: { corrId: "", version: server.version },
        data: {
          pid: "worker2",
          ttl: 5000,
          action: {
            kind: "promise.create",
            head: { corrId: "", version: server.version },
            data: {
              id: "p1",
              param: { headers: {}, data: "" },
              tags: { "resonate:invoke": "default" },
              timeoutAt: Number.MAX_SAFE_INTEGER,
            },
          },
        },
      },
    });
    assert(res.kind === "task.create");
    assert(isStatus(res, 200));
    expect(res.data.task).toBeUndefined();
    expect(res.data.promise.createdAt).toBe(0);
    settlePromise(server, "p1", 2);
  });

  test("8 -> TaskCreate | ⟨a, e, l, v, c, R⟩ → same | 200 (idempotent)", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    const res = server.process({
      at: 2,
      req: {
        kind: "task.create",
        head: { corrId: "", version: server.version },
        data: {
          pid: "worker2",
          ttl: 5000,
          action: {
            kind: "promise.create",
            head: { corrId: "", version: server.version },
            data: {
              id: "p1",
              param: { headers: {}, data: "" },
              tags: { "resonate:invoke": "default" },
              timeoutAt: Number.MAX_SAFE_INTEGER,
            },
          },
        },
      },
    });
    assert(res.kind === "task.create");
    assert(isStatus(res, 200));
    expect(res.data.task).toBeUndefined();
    expect(res.data.promise.createdAt).toBe(0);
    settlePromise(server, "p1", 3);
  });

  test("9 -> TaskCreate | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ → same | 200 (idempotent)", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    suspendTask(server, task.id, task.version, 2);
    const res = server.process({
      at: 3,
      req: {
        kind: "task.create",
        head: { corrId: "", version: server.version },
        data: {
          pid: "worker2",
          ttl: 5000,
          action: {
            kind: "promise.create",
            head: { corrId: "", version: server.version },
            data: {
              id: "p1",
              param: { headers: {}, data: "" },
              tags: { "resonate:invoke": "default" },
              timeoutAt: Number.MAX_SAFE_INTEGER,
            },
          },
        },
      },
    });
    assert(res.kind === "task.create");
    assert(isStatus(res, 200));
    expect(res.data.task).toBeUndefined();
    expect(res.data.promise.createdAt).toBe(0);
    settlePromise(server, "p1", 4);
  });

  test("10 -> TaskCreate | ⟨f, ⊥, ⊥, ⊥, ⊥, ∅⟩ → same | 200 (idempotent)", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    fulfillTask(server, task.id, task.version, "p1", 2);
    const res = server.process({
      at: 3,
      req: {
        kind: "task.create",
        head: { corrId: "", version: server.version },
        data: {
          pid: "worker2",
          ttl: 5000,
          action: {
            kind: "promise.create",
            head: { corrId: "", version: server.version },
            data: {
              id: "p1",
              param: { headers: {}, data: "" },
              tags: { "resonate:invoke": "default" },
              timeoutAt: Number.MAX_SAFE_INTEGER,
            },
          },
        },
      },
    });
    assert(res.kind === "task.create");
    assert(isStatus(res, 200));
    expect(res.data.task).toBeUndefined();
    expect(res.data.promise.createdAt).toBe(0);
  });
});

describe("TaskAcquire(t, l, v) Transitions", () => {
  test("11 -> TaskAcquire(v) | ⊥ → ⊥ | 404", () => {
    const server = new Server();
    const res = acquireTask(server, "nonexistent", 0, 0);
    assert(res.kind === "task.acquire");
    assert(isStatus(res, 404));
  });

  test("12 -> TaskAcquire(v) | ⟨p, e, l, v, c, R⟩ → ⟨a, t+l, l, v, c, R⟩ | 200", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    const res = acquireTask(server, task.id, task.version, 1);
    assert(res.kind === "task.acquire");
    assert(isStatus(res, 200));
    settlePromise(server, "p1", 2);
  });

  test("13 -> TaskAcquire(v') | ⟨p, e, l, v, c, R⟩ → same | 409 (version mismatch)", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    const res = acquireTask(server, task.id, task.version + 1, 1);
    assert(res.kind === "task.acquire");
    assert(isStatus(res, 409));
    settlePromise(server, "p1", 2);
  });

  test("14 -> TaskAcquire(v) | ⟨a, e, l, v, c, R⟩ → same | 409", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    const res = acquireTask(server, task.id, task.version, 2);
    assert(res.kind === "task.acquire");
    assert(isStatus(res, 409));
    settlePromise(server, "p1", 3);
  });

  test("15 -> TaskAcquire(v') | ⟨a, e, l, v, c, R⟩ → same | 409 (version mismatch)", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    const res = acquireTask(server, task.id, task.version + 1, 2);
    assert(res.kind === "task.acquire");
    assert(isStatus(res, 409));
    settlePromise(server, "p1", 3);
  });

  test("16 -> TaskAcquire(v) | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ → same | 409", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    suspendTask(server, task.id, task.version, 2);
    const res = acquireTask(server, task.id, task.version, 3);
    assert(res.kind === "task.acquire");
    assert(isStatus(res, 409));
    settlePromise(server, "p1", 4);
  });

  test("17 -> TaskAcquire(v') | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ → same | 409 (version mismatch)", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    suspendTask(server, task.id, task.version, 2);
    const res = acquireTask(server, task.id, task.version + 1, 3);
    assert(res.kind === "task.acquire");
    assert(isStatus(res, 409));
    settlePromise(server, "p1", 4);
  });

  test("18 -> TaskAcquire(v) | ⟨f, ⊥, ⊥, ⊥, ⊥, ∅⟩ → same | 409", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    fulfillTask(server, task.id, task.version, "p1", 2);
    const res = acquireTask(server, task.id, task.version, 3);
    assert(res.kind === "task.acquire");
    assert(isStatus(res, 409));
  });
});

describe("TaskRelease(t, l, v) Transitions", () => {
  test("19 -> TaskRelease(v) | ⊥ → ⊥ | 404", () => {
    const server = new Server();
    const res = releaseTask(server, "nonexistent", 0, 0);
    assert(res.kind === "task.release");
    assert(isStatus(res, 404));
  });

  test("20 -> TaskRelease(v) | ⟨p, e, l, v, c, R⟩ → same | 409", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    const res = releaseTask(server, task.id, task.version, 1);
    assert(res.kind === "task.release");
    assert(isStatus(res, 409));
    settlePromise(server, "p1", 2);
  });

  test("21 -> TaskRelease(v') | ⟨p, e, l, v, c, R⟩ → same | 409 (version mismatch)", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    const res = releaseTask(server, task.id, task.version + 1, 1);
    assert(res.kind === "task.release");
    assert(isStatus(res, 409));
    settlePromise(server, "p1", 2);
  });

  test("22 -> TaskRelease(v) | ⟨a, e, l, v, Invoke, R⟩ → ⟨p, t+l, l, v+1, Invoke, R⟩ | 200 | Send(Invoke)", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    const res = releaseTask(server, task.id, task.version, 2);
    assert(res.kind === "task.release");
    assert(isStatus(res, 200));
    const msgs = server.step({ at: 2 });
    expect(msgs.length).toBe(1);
    expect(msgs[0].mesg.kind).toBe("invoke");
    assert(msgs[0].mesg.kind === "invoke");
    expect(msgs[0].mesg.data.task.version).toBe(task.version + 1);
    settlePromise(server, "p1", 3);
  });

  test("23 -> TaskRelease(v) | ⟨a, e, l, v, Resume, R⟩ → ⟨p, t+l, l, v+1, Resume, R⟩ | 200 | Send(Resume)", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    createPromise(server, "p2", 0);
    acquireTask(server, task.id, task.version, 1);
    suspendTask(server, task.id, task.version, 2, [
      {
        kind: "promise.register",
        head: { corrId: "", version: server.version },
        data: { awaiter: "p1", awaited: "p2" },
      },
    ]);
    settlePromise(server, "p2", 3);
    const resumeMsgs = server.step({ at: 3 });
    expect(resumeMsgs.length).toBe(1);
    expect(resumeMsgs[0].mesg.kind).toBe("resume");
    assert(resumeMsgs[0].mesg.kind === "resume");
    const resumeTask = resumeMsgs[0].mesg.data.task;

    const acquireRes = acquireTask(
      server,
      resumeTask.id,
      resumeTask.version,
      4,
    );
    assert(acquireRes.kind === "task.acquire");
    assert(isStatus(acquireRes, 200));

    const res = releaseTask(server, resumeTask.id, resumeTask.version, 5);
    assert(res.kind === "task.release");
    assert(isStatus(res, 200));

    const msgs = server.step({ at: 5 });
    expect(msgs.length).toBe(1);
    expect(msgs[0].mesg.kind).toBe("resume");
    settlePromise(server, "p1", 6);
  });

  test("24 -> TaskRelease(v') | ⟨a, e, l, v, c, R⟩ → same | 409 (version mismatch)", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    const res = releaseTask(server, task.id, task.version + 1, 2);
    assert(res.kind === "task.release");
    assert(isStatus(res, 409));
    settlePromise(server, "p1", 3);
  });

  test("25 -> TaskRelease(v) | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ → same | 409", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    suspendTask(server, task.id, task.version, 2);
    const res = releaseTask(server, task.id, task.version, 3);
    assert(res.kind === "task.release");
    assert(isStatus(res, 409));
    settlePromise(server, "p1", 4);
  });

  test("26 -> TaskRelease(v') | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ → same | 409 (version mismatch)", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    suspendTask(server, task.id, task.version, 2);
    const res = releaseTask(server, task.id, task.version + 1, 3);
    assert(res.kind === "task.release");
    assert(isStatus(res, 409));
    settlePromise(server, "p1", 4);
  });

  test("27 -> TaskRelease(v) | ⟨f, ⊥, ⊥, ⊥, ⊥, ∅⟩ → same | 409", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    fulfillTask(server, task.id, task.version, "p1", 2);
    const res = releaseTask(server, task.id, task.version, 3);
    assert(res.kind === "task.release");
    assert(isStatus(res, 409));
  });
});

describe("TaskSuspend(v, P) Transitions", () => {
  test("28 -> TaskSuspend(v, P) | ⊥ → ⊥ | 404", () => {
    const server = new Server();
    const res = suspendTask(server, "nonexistent", 0, 0);
    assert(res.kind === "task.suspend");
    assert(isStatus(res, 404));
  });

  test("29 -> TaskSuspend(v, P) | ⟨p, e, l, v, c, R⟩ → same | 409", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    const res = suspendTask(server, task.id, task.version, 1);
    assert(res.kind === "task.suspend");
    assert(isStatus(res, 409));
    settlePromise(server, "p1", 2);
  });

  test("30 -> TaskSuspend(v', P) | ⟨p, e, l, v, c, R⟩ → same | 409 (version mismatch)", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    const res = suspendTask(server, task.id, task.version + 1, 1);
    assert(res.kind === "task.suspend");
    assert(isStatus(res, 409));
    settlePromise(server, "p1", 2);
  });

  test("31 -> TaskSuspend(v, P) | ⟨a, e, l, v, c, ∅⟩ : Pending(p) ∀p∈P → ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ | 200", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    createPromise(server, "p2", 0);
    acquireTask(server, task.id, task.version, 1);
    const res = suspendTask(server, task.id, task.version, 2, [
      {
        kind: "promise.register",
        head: { corrId: "", version: server.version },
        data: { awaiter: "p1", awaited: "p2" },
      },
    ]);
    assert(res.kind === "task.suspend");
    assert(isStatus(res, 200));
    settlePromise(server, "p2", 3);
    settlePromise(server, "p1", 4);
  });

  test("32 -> TaskSuspend(v, P) | ⟨a, e, l, v, c, ∅⟩ : Settled(p) ∃p∈P → ⟨a, e, l, v, Resume, ∅⟩ | 300", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    createPromise(server, "p2", 0);
    settlePromise(server, "p2", 1);
    acquireTask(server, task.id, task.version, 2);
    const res = suspendTask(server, task.id, task.version, 3, [
      {
        kind: "promise.register",
        head: { corrId: "", version: server.version },
        data: { awaiter: "p1", awaited: "p2" },
      },
    ]);
    assert(res.kind === "task.suspend");
    assert(isStatus(res, 300));
    settlePromise(server, "p1", 4);
  });

  test("34 -> TaskSuspend(v', P) | ⟨a, e, l, v, c, R⟩ → same | 409 (version mismatch)", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    const res = suspendTask(server, task.id, task.version + 1, 2);
    assert(res.kind === "task.suspend");
    assert(isStatus(res, 409));
    settlePromise(server, "p1", 3);
  });

  test("35 -> TaskSuspend(v, P) | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ → same | 409", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    suspendTask(server, task.id, task.version, 2);
    const res = suspendTask(server, task.id, task.version, 3);
    assert(res.kind === "task.suspend");
    assert(isStatus(res, 409));
    settlePromise(server, "p1", 4);
  });

  test("36 -> TaskSuspend(v', P) | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ → same | 409 (version mismatch)", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    suspendTask(server, task.id, task.version, 2);
    const res = suspendTask(server, task.id, task.version + 1, 3);
    assert(res.kind === "task.suspend");
    assert(isStatus(res, 409));
    settlePromise(server, "p1", 4);
  });

  test("37 -> TaskSuspend(v, P) | ⟨f, ⊥, ⊥, ⊥, ⊥, ∅⟩ → same | 409", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    fulfillTask(server, task.id, task.version, "p1", 2);
    const res = suspendTask(server, task.id, task.version, 3);
    assert(res.kind === "task.suspend");
    assert(isStatus(res, 409));
  });
});

describe("TaskFence(v) Transitions", () => {
  test("38 -> TaskFence(v) | ⊥ → ⊥ | 404", () => {
    const server = new Server();
    const res = fenceTask(server, "nonexistent", 0, 0);
    assert(res.kind === "task.fence");
    assert(isStatus(res, 404));
  });

  test("39 -> TaskFence(v) | ⟨p, e, l, v, c, R⟩ → same | 409", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    const res = fenceTask(server, task.id, task.version, 1);
    assert(res.kind === "task.fence");
    assert(isStatus(res, 409));
    settlePromise(server, "p1", 2);
  });

  test("40 -> TaskFence(v') | ⟨p, e, l, v, c, R⟩ → same | 409 (version mismatch)", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    const res = fenceTask(server, task.id, task.version + 1, 1);
    assert(res.kind === "task.fence");
    assert(isStatus(res, 409));
    settlePromise(server, "p1", 2);
  });

  test("41 -> TaskFence(v) | ⟨a, e, l, v, c, R⟩ → same | 200", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    const res = fenceTask(server, task.id, task.version, 2);
    assert(res.kind === "task.fence");
    assert(isStatus(res, 200));
    settlePromise(server, "p1", 3);
  });

  test("42 -> TaskFence(v') | ⟨a, e, l, v, c, R⟩ → same | 409 (version mismatch)", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    const res = fenceTask(server, task.id, task.version + 1, 2);
    assert(res.kind === "task.fence");
    assert(isStatus(res, 409));
    settlePromise(server, "p1", 3);
  });

  test("43 -> TaskFence(v) | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ → same | 409", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    suspendTask(server, task.id, task.version, 2);
    const res = fenceTask(server, task.id, task.version, 3);
    assert(res.kind === "task.fence");
    assert(isStatus(res, 409));
    settlePromise(server, "p1", 4);
  });

  test("44 -> TaskFence(v') | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ → same | 409 (version mismatch)", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    suspendTask(server, task.id, task.version, 2);
    const res = fenceTask(server, task.id, task.version + 1, 3);
    assert(res.kind === "task.fence");
    assert(isStatus(res, 409));
    settlePromise(server, "p1", 4);
  });

  test("45 -> TaskFence(v) | ⟨f, ⊥, ⊥, ⊥, ⊥, ∅⟩ → same | 409", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    fulfillTask(server, task.id, task.version, "p1", 2);
    const res = fenceTask(server, task.id, task.version, 3);
    assert(res.kind === "task.fence");
    assert(isStatus(res, 409));
  });
});

describe("TaskHeartbeat(t, v) Transitions", () => {
  test("46 -> TaskHeartbeat(t, v) | ⊥ -> ⊥ | 404", () => {
    const server = new Server();
    const res = heartbeatTask(
      server,
      "worker1",
      [{ id: "nonexisting", version: 0 }],
      1,
    );
    assert(res.kind === "task.heartbeat");
    assert(isStatus(res, 404));
  });
  test("47 -> TaskHeartbeat(t, v) | ⟨p, e, l, v, c, R⟩ → same | 200", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    const res = heartbeatTask(server, "worker1", [task], 1);
    assert(res.kind === "task.heartbeat");
    assert(isStatus(res, 200));
    settlePromise(server, "p1", 2);
  });

  test("48 -> TaskHeartbeat(t, v') | ⟨p, e, l, v, c, R⟩ → same | 200 (noop)", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    const res = heartbeatTask(
      server,
      "worker1",
      [{ id: task.id, version: task.version + 1 }],
      1,
    );
    assert(res.kind === "task.heartbeat");
    assert(isStatus(res, 200));
    settlePromise(server, "p1", 2);
  });

  test("49 -> TaskHeartbeat(t, v) | ⟨a, e, l, v, c, R⟩ → ⟨a, t+l, l, v, c, R⟩ | 200", () => {
    const taskExpiryMs = 5000;
    const server = new Server(taskExpiryMs);
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    const before = server.getState().tasks[task.id].expiry;
    expect(before).toBe(taskExpiryMs + 1);
    const res = heartbeatTask(server, "worker1", [task], 2);
    const after = server.getState().tasks[task.id].expiry;
    expect(after).toBe(taskExpiryMs + 2);
    assert(res.kind === "task.heartbeat");
    assert(isStatus(res, 200));
    settlePromise(server, "p1", 3);
  });

  test("50 -> TaskHeartbeat(t, v') | ⟨a, e, l, v, c, R⟩ → same | 200 (not extended)", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    const res = heartbeatTask(
      server,
      "worker1",
      [{ id: task.id, version: task.version + 1 }],
      2,
    );
    assert(res.kind === "task.heartbeat");
    assert(isStatus(res, 200));
    settlePromise(server, "p1", 3);
  });

  test("51 -> TaskHeartbeat(t, v) | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ → same | 200", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    suspendTask(server, task.id, task.version, 2);
    const res = heartbeatTask(server, "worker1", [task], 3);
    assert(res.kind === "task.heartbeat");
    assert(isStatus(res, 200));
    settlePromise(server, "p1", 4);
  });

  test("52 -> TaskHeartbeat(t, v') | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ → same | 200 (noop)", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    suspendTask(server, task.id, task.version, 2);
    const res = heartbeatTask(
      server,
      "worker1",
      [{ id: task.id, version: task.version + 1 }],
      3,
    );
    assert(res.kind === "task.heartbeat");
    assert(isStatus(res, 200));
    settlePromise(server, "p1", 4);
  });

  test("53 -> TaskHeartbeat(t, v) | ⟨f, ⊥, ⊥, ⊥, ⊥, ∅⟩ → same | 200", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    fulfillTask(server, task.id, task.version, "p1", 2);
    const res = heartbeatTask(server, "worker1", [task], 3);
    assert(res.kind === "task.heartbeat");
    assert(isStatus(res, 200));
  });
});

describe("TaskFulfill(v) Transitions", () => {
  test("54 -> TaskFulfill(v) | ⊥ → ⊥ | 404", () => {
    const server = new Server();
    const res = fulfillTask(server, "nonexistent", 0, "nonexistent", 0);
    assert(res.kind === "task.fulfill");
    assert(isStatus(res, 404));
  });

  test("55 -> TaskFulfill(v) | ⟨p, e, l, v, c, R⟩ → same | 409", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    const res = fulfillTask(server, task.id, task.version, "p1", 1);
    assert(res.kind === "task.fulfill");
    assert(isStatus(res, 409));
    settlePromise(server, "p1", 2);
  });

  test("56 -> TaskFulfill(v') | ⟨p, e, l, v, c, R⟩ → same | 409 (version mismatch)", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    const res = fulfillTask(server, task.id, task.version + 1, "p1", 1);
    assert(res.kind === "task.fulfill");
    assert(isStatus(res, 409));
    settlePromise(server, "p1", 2);
  });

  test("57 -> TaskFulfill(v) | ⟨a, e, l, v, c, R⟩ → ⟨f, ⊥, ⊥, ⊥, ⊥, ∅⟩ | 200", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    const res = fulfillTask(server, task.id, task.version, "p1", 2);
    assert(res.kind === "task.fulfill");
    assert(isStatus(res, 200));
  });

  test("58 -> TaskFulfill(v') | ⟨a, e, l, v, c, R⟩ → same | 409 (version mismatch)", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    const res = fulfillTask(server, task.id, task.version + 1, "p1", 2);
    assert(res.kind === "task.fulfill");
    assert(isStatus(res, 409));
    settlePromise(server, "p1", 3);
  });

  test("59 -> TaskFulfill(v) | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ → same | 409", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    suspendTask(server, task.id, task.version, 2);
    const res = fulfillTask(server, task.id, task.version, "p1", 3);
    assert(res.kind === "task.fulfill");
    assert(isStatus(res, 409));
    settlePromise(server, "p1", 4);
  });

  test("60 -> TaskFulfill(v') | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ → same | 409 (version mismatch)", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    suspendTask(server, task.id, task.version, 2);
    const res = fulfillTask(server, task.id, task.version + 1, "p1", 3);
    assert(res.kind === "task.fulfill");
    assert(isStatus(res, 409));
    settlePromise(server, "p1", 4);
  });

  test("61 -> TaskFulfill(v) | ⟨f, ⊥, ⊥, ⊥, ⊥, ∅⟩ → same | 409", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    fulfillTask(server, task.id, task.version, "p1", 2);
    const res = fulfillTask(server, task.id, task.version, "p1", 3);
    assert(res.kind === "task.fulfill");
    assert(isStatus(res, 409));
  });
});

describe("Enqueue(Invoke, t, l) Side Effects", () => {
  test("62 -> Enqueue(Invoke) | ⊥ → ⟨p, t+l, l, 0, Invoke, ∅⟩ | Send(Invoke)", () => {
    const server = new Server();
    createPromise(server, "p1", 0, { tags: { "resonate:invoke": "default" } });
    const msgs = server.step({ at: 0 });
    expect(msgs.length).toBe(1);
    expect(msgs[0].mesg.kind).toBe("invoke");
    assert(msgs[0].mesg.kind === "invoke");
    expect(msgs[0].mesg.data.task.id).toStartWith("__invoke");
    settlePromise(server, "p1", 1);
  });

  test("63 -> Enqueue(Invoke) | ⟨p, e, l, v, c, R⟩ → same | no additional effect", () => {
    const server = new Server();
    createPromise(server, "p1", 0, { tags: { "resonate:invoke": "default" } });
    server.step({ at: 0 });
    createPromise(server, "p1", 1, { tags: { "resonate:invoke": "default" } });
    const msgs = server.step({ at: 1 });
    expect(msgs.length).toBe(0);
    settlePromise(server, "p1", 2);
  });

  test("64 -> Enqueue(Invoke) | ⟨a, e, l, v, c, R⟩ → same | no additional effect", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    createPromise(server, "p1", 2, { tags: { "resonate:invoke": "default" } });
    const msgs = server.step({ at: 2 });
    expect(msgs.length).toBe(0);
    settlePromise(server, "p1", 3);
  });

  test("65 -> Enqueue(Invoke) | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ → same | no additional effect", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    suspendTask(server, task.id, task.version, 2);
    createPromise(server, "p1", 3, { tags: { "resonate:invoke": "default" } });
    const msgs = server.step({ at: 3 });
    expect(msgs.length).toBe(0);
    settlePromise(server, "p1", 4);
  });

  test("66 -> Enqueue(Invoke) | ⟨f, ⊥, ⊥, ⊥, ⊥, ∅⟩ → same | no additional effect", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    fulfillTask(server, task.id, task.version, "p1", 2);
    createPromise(server, "p1", 3, { tags: { "resonate:invoke": "default" } });
    const msgs = server.step({ at: 3 });
    expect(msgs.length).toBe(0);
  });
});

describe("Enqueue(Resume, t, l) Side Effects", () => {
  test("68 -> Enqueue(Resume) | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ → ⟨p, t+l, l, v+1, Resume, ∅⟩ | Send(Resume)", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    createPromise(server, "p2", 0);
    acquireTask(server, task.id, task.version, 1);
    suspendTask(server, task.id, task.version, 2, [
      {
        kind: "promise.register",
        head: { corrId: "", version: server.version },
        data: { awaiter: "p1", awaited: "p2" },
      },
    ]);
    settlePromise(server, "p2", 3);
    const msgs = server.step({ at: 3 });
    expect(msgs.length).toBe(1);
    expect(msgs[0].mesg.kind).toBe("resume");
    assert(msgs[0].mesg.kind === "resume");
    expect(msgs[0].mesg.data.task.id).toStartWith("__resume");
    expect(msgs[0].mesg.data.task.version).toBe(task.version + 1);
    settlePromise(server, "p1", 4);
  });

  test("69 -> Enqueue(Resume) | ⟨p, e, l, v, c, R⟩ → ⟨p, e, l, v, c, R::Resume⟩ | no immediate send", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    createPromise(server, "p2", 0);
    createPromise(server, "p3", 0);
    acquireTask(server, task.id, task.version, 1);
    suspendTask(server, task.id, task.version, 2, [
      {
        kind: "promise.register",
        head: { corrId: "", version: server.version },
        data: { awaiter: "p1", awaited: "p2" },
      },
      {
        kind: "promise.register",
        head: { corrId: "", version: server.version },
        data: { awaiter: "p1", awaited: "p3" },
      },
    ]);
    settlePromise(server, "p2", 3);
    const msgs1 = server.step({ at: 3 });
    expect(msgs1.length).toBe(1);
    expect(msgs1[0].mesg.kind).toBe("resume");

    settlePromise(server, "p3", 4);
    const msgs2 = server.step({ at: 4 });
    expect(msgs2.length).toBe(0);

    settlePromise(server, "p1", 5);
  });

  test("71 -> Enqueue(Resume) | ⟨f, ⊥, ⊥, ⊥, ⊥, ∅⟩ → same | no effect", () => {
    const server = new Server();
    const task = createPromiseWithTask(server, "p1", 0);
    createPromise(server, "p2", 0);
    acquireTask(server, task.id, task.version, 1);
    suspendTask(server, task.id, task.version, 2, [
      {
        kind: "promise.register",
        head: { corrId: "", version: server.version },
        data: { awaiter: "p1", awaited: "p2" },
      },
    ]);
    settlePromise(server, "p2", 3);
    server.step({ at: 3 });
    const resumeRes = acquireTask(server, task.id, task.version + 1, 4);
    assert(resumeRes.kind === "task.acquire");
    assert(isStatus(resumeRes, 200));
    fulfillTask(server, task.id, task.version + 1, "p1", 5);

    settlePromise(server, "p2", 6);
    const msgs = server.step({ at: 6 });
    expect(msgs.length).toBe(0);
  });
});

describe("Tick(t) Transitions", () => {
  test("72 -> Tick(t) | ⊥ → ⊥ | no effect", () => {
    const server = new Server();
    const msgs = server.step({ at: 1000 });
    expect(msgs.length).toBe(0);
  });

  test("73 -> Tick(t < e) | ⟨p, e, l, v, c, R⟩ → same | no change, no message", () => {
    const server = new Server(5000);
    const task = createPromiseWithTask(server, "p1", 0);
    const msgs = server.step({ at: 10 });
    expect(msgs.length).toBe(0);
    const getRes = server.process({
      at: 11,
      req: {
        kind: "task.get",
        head: { corrId: "", version: server.version },
        data: { id: task.id },
      },
    });
    assert(getRes.kind === "task.get");
    assert(isStatus(getRes, 200));
    expect(getRes.data.task.version).toBe(task.version);
    settlePromise(server, "p1", 12);
  });

  test("74 -> Tick(t ≥ e) | ⟨p, e, l, v, Invoke, R⟩ → ⟨p, t+l, l, v, Invoke, R⟩ | Send(Invoke)", () => {
    const server = new Server(50);
    const task = createPromiseWithTask(server, "p1", 0);
    const msgs = server.step({ at: 100 });
    expect(msgs.length).toBe(1);
    expect(msgs[0].mesg.kind).toBe("invoke");
    assert(msgs[0].mesg.kind === "invoke");
    expect(msgs[0].mesg.data.task.version).toBe(task.version);
    settlePromise(server, "p1", 101);
  });

  test("75 -> Tick(t ≥ e) | ⟨p, e, l, v, Resume, R⟩ → ⟨p, t+l, l, v, Resume, R⟩ | Send(Resume)", () => {
    const server = new Server(50);
    const task = createPromiseWithTask(server, "p1", 0);
    createPromise(server, "p2", 0);
    acquireTask(server, task.id, task.version, 1);
    suspendTask(server, task.id, task.version, 2, [
      {
        kind: "promise.register",
        head: { corrId: "", version: server.version },
        data: { awaiter: "p1", awaited: "p2" },
      },
    ]);
    settlePromise(server, "p2", 3);
    const resumeMsgs = server.step({ at: 3 });
    expect(resumeMsgs.length).toBe(1);
    expect(resumeMsgs[0].mesg.kind).toBe("resume");
    assert(resumeMsgs[0].mesg.kind === "resume");
    const resumeVersion = resumeMsgs[0].mesg.data.task.version;

    const tickMsgs = server.step({ at: 100 });
    expect(tickMsgs.length).toBe(1);
    expect(tickMsgs[0].mesg.kind).toBe("resume");
    assert(tickMsgs[0].mesg.kind === "resume");
    expect(tickMsgs[0].mesg.data.task.version).toBe(resumeVersion);
    settlePromise(server, "p1", 101);
  });

  test("76 -> Tick(t < e) | ⟨a, e, l, v, c, R⟩ → same | no change, no message", () => {
    const server = new Server(100);
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    const msgs = server.step({ at: 10 });
    expect(msgs.length).toBe(0);
    settlePromise(server, "p1", 11);
  });

  test("77 -> Tick(t ≥ e) | ⟨a, e, l, v, Invoke, R⟩ → ⟨p, t+l, l, v+1, Invoke, R⟩ | Send(Invoke)", () => {
    const server = new Server(50);
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    const msgs = server.step({ at: 100 });
    expect(msgs.length).toBe(1);
    expect(msgs[0].mesg.kind).toBe("invoke");
    assert(msgs[0].mesg.kind === "invoke");
    expect(msgs[0].mesg.data.task.id).toStartWith("__invoke");
    expect(msgs[0].mesg.data.task.version).toBe(task.version + 1);
    settlePromise(server, "p1", 101);
  });

  test("78 -> Tick(t ≥ e) | ⟨a, e, l, v, Resume, R⟩ → ⟨p, t+l, l, v+1, Resume, R⟩ | Send(Resume)", () => {
    const server = new Server(50);
    const task = createPromiseWithTask(server, "p1", 0);
    createPromise(server, "p2", 0);
    acquireTask(server, task.id, task.version, 1);
    suspendTask(server, task.id, task.version, 2, [
      {
        kind: "promise.register",
        head: { corrId: "", version: server.version },
        data: { awaiter: "p1", awaited: "p2" },
      },
    ]);
    settlePromise(server, "p2", 3);
    const resumeMsgs = server.step({ at: 3 });
    expect(resumeMsgs.length).toBe(1);
    expect(resumeMsgs[0].mesg.kind).toBe("resume");
    assert(resumeMsgs[0].mesg.kind === "resume");
    expect(resumeMsgs[0].mesg.data.task.id).toStartWith("__resume");
    const resumeTask = resumeMsgs[0].mesg.data.task;

    acquireTask(server, resumeTask.id, resumeTask.version, 4);

    const tickMsgs = server.step({ at: 100 });
    expect(tickMsgs.length).toBe(1);
    expect(tickMsgs[0].mesg.kind).toBe("resume");
    assert(tickMsgs[0].mesg.kind === "resume");
    expect(resumeMsgs[0].mesg.data.task.id).toStartWith("__resume");
    expect(tickMsgs[0].mesg.data.task.version).toBe(resumeTask.version + 1);
    settlePromise(server, "p1", 101);
  });

  test("79 -> Tick(t) | ⟨s, ⊥, ⊥, v, ⊥, ∅⟩ → same | no change, no message", () => {
    const server = new Server(100);
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    suspendTask(server, task.id, task.version, 2);
    const msgs = server.step({ at: 10000 });
    expect(msgs.length).toBe(0);
    settlePromise(server, "p1", 10001);
  });

  test("80 -> Tick(t) | ⟨f, ⊥, ⊥, ⊥, ⊥, ∅⟩ → same | no change, no message", () => {
    const server = new Server(100);
    const task = createPromiseWithTask(server, "p1", 0);
    acquireTask(server, task.id, task.version, 1);
    fulfillTask(server, task.id, task.version, "p1", 2);
    const msgs = server.step({ at: 10000 });
    expect(msgs.length).toBe(0);
  });
});
