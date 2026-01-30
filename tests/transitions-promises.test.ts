import { describe, expect, test } from "bun:test";
import { Server } from "../src";
import { assert, isStatus } from "../src/utils";

// Helper to create promise
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

function settlePromise(
  server: Server,
  id: string,
  at: number,
  state: "resolved" | "rejected" | "rejected_canceled" = "resolved",
) {
  return server.process({
    at,
    req: {
      kind: "promise.settle",
      head: { corrId: "", version: server.version },
      data: { id, state, value: { headers: {}, data: "" } },
    },
  });
}

function subscribePromise(
  server: Server,
  awaited: string,
  address: string,
  at: number,
) {
  return server.process({
    at,
    req: {
      kind: "promise.subscribe",
      head: { corrId: "", version: server.version },
      data: { awaited, address },
    },
  });
}

function registerPromise(
  server: Server,
  awaiter: string,
  awaited: string,
  at: number,
) {
  return server.process({
    at,
    req: {
      kind: "promise.register",
      head: { corrId: "", version: server.version },
      data: { awaiter, awaited },
    },
  });
}

describe("PromiseGet() Transitions", () => {
  test("1 -> PromiseGet() | ⊥ → ⊥ | 404", () => {
    const server = new Server();
    const res = server.process({
      at: 0,
      req: {
        kind: "promise.get",
        head: { corrId: "", version: server.version },
        data: { id: "nonexistent" },
      },
    });
    assert(res.kind === "promise.get");
    assert(isStatus(res, 404));
    expect(server.step({ at: 0 }).length).toBe(0);
  });

  test("2 -> PromiseGet() | ⟨p, o, ⊥, ⊥, ∅, S⟩ → same | 200", () => {
    const server = new Server();
    createPromise(server, "p1", 0);
    const res = server.process({
      at: 1,
      req: {
        kind: "promise.get",
        head: { corrId: "", version: server.version },
        data: { id: "p1" },
      },
    });
    assert(res.kind === "promise.get");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("pending");
    expect(server.step({ at: 1 }).length).toBe(0);
  });

  test("3 -> PromiseGet() | ⟨p, o, ⊥, a, C, S⟩ → same | 200", () => {
    const server = new Server();
    createPromise(server, "p1", 0, { tags: { "resonate:invoke": "default" } });
    server.step({ at: 0 });
    const res = server.process({
      at: 1,
      req: {
        kind: "promise.get",
        head: { corrId: "", version: server.version },
        data: { id: "p1" },
      },
    });
    assert(res.kind === "promise.get");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("pending");
    expect(server.step({ at: 1 }).length).toBe(0);
    settlePromise(server, "p1", 2);
  });

  test("4 -> PromiseGet() | ⟨p, o, ⊤, ⊥, ∅, S⟩ → same | 200", () => {
    const server = new Server();
    createPromise(server, "p1", 0, { tags: { "resonate:timeout": "true" } });
    const res = server.process({
      at: 1,
      req: {
        kind: "promise.get",
        head: { corrId: "", version: server.version },
        data: { id: "p1" },
      },
    });
    assert(res.kind === "promise.get");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("pending");
    expect(server.step({ at: 1 }).length).toBe(0);
  });

  test("5 -> PromiseGet() | ⟨p, o, ⊤, a, C, S⟩ → same | 200", () => {
    const server = new Server();
    createPromise(server, "p1", 0, {
      tags: { "resonate:invoke": "default", "resonate:timeout": "true" },
    });
    server.step({ at: 0 });
    const res = server.process({
      at: 1,
      req: {
        kind: "promise.get",
        head: { corrId: "", version: server.version },
        data: { id: "p1" },
      },
    });
    assert(res.kind === "promise.get");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("pending");
    expect(server.step({ at: 1 }).length).toBe(0);
    settlePromise(server, "p1", 2);
  });

  test("6 -> PromiseGet() | ⟨r, ⊥, ⊥, ⊥, ∅, ∅⟩ → same | 200", () => {
    const server = new Server();
    createPromise(server, "p1", 0);
    settlePromise(server, "p1", 1, "resolved");
    const res = server.process({
      at: 2,
      req: {
        kind: "promise.get",
        head: { corrId: "", version: server.version },
        data: { id: "p1" },
      },
    });
    assert(res.kind === "promise.get");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("resolved");
    expect(server.step({ at: 2 }).length).toBe(0);
  });

  test("7 -> PromiseGet() | ⟨x, ⊥, ⊥, ⊥, ∅, ∅⟩ → same | 200", () => {
    const server = new Server();
    createPromise(server, "p1", 0);
    settlePromise(server, "p1", 1, "rejected");
    const res = server.process({
      at: 2,
      req: {
        kind: "promise.get",
        head: { corrId: "", version: server.version },
        data: { id: "p1" },
      },
    });
    assert(res.kind === "promise.get");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("rejected");
    expect(server.step({ at: 2 }).length).toBe(0);
  });

  test("8 -> PromiseGet() | ⟨c, ⊥, ⊥, ⊥, ∅, ∅⟩ → same | 200", () => {
    const server = new Server();
    createPromise(server, "p1", 0);
    settlePromise(server, "p1", 1, "rejected_canceled");
    const res = server.process({
      at: 2,
      req: {
        kind: "promise.get",
        head: { corrId: "", version: server.version },
        data: { id: "p1" },
      },
    });
    assert(res.kind === "promise.get");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("rejected_canceled");
    expect(server.step({ at: 2 }).length).toBe(0);
  });

  test("9 -> PromiseGet() | ⟨t, ⊥, ⊥, ⊥, ∅, ∅⟩ → same | 200", () => {
    const server = new Server();
    createPromise(server, "p1", 0, { timeoutAt: 0 });
    const res = server.process({
      at: 1,
      req: {
        kind: "promise.get",
        head: { corrId: "", version: server.version },
        data: { id: "p1" },
      },
    });
    assert(res.kind === "promise.get");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("rejected_timedout");
    expect(server.step({ at: 1 }).length).toBe(0);
  });
});

describe("PromiseCreate(t, o, ⊥, ⊥) - no timer, no address", () => {
  test("10 ->PromiseCreate | ⊥ → ⟨p, o, ⊥, ⊥, ∅, ∅⟩ | 200 | no side effects", () => {
    const server = new Server();
    const res = createPromise(server, "p1", 0);
    assert(res.kind === "promise.create");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("pending");
    expect(server.step({ at: 0 }).length).toBe(0);
  });

  test("11 -> PromiseCreate | ⟨p, o, ⊥, ⊥, ∅, S⟩ : t < o → same | 200 | no side effects", () => {
    const server = new Server();
    createPromise(server, "p1", 0, { timeoutAt: 100 });
    const res = createPromise(server, "p1", 50, { timeoutAt: 100 });
    assert(res.kind === "promise.create");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("pending");
    expect(server.step({ at: 50 }).length).toBe(0);
  });

  test("12 -> PromiseCreate | ⟨p, o, ⊥, ⊥, ∅, S⟩ : t ≥ o → ⟨t⟩ | 200 | Send(Notify) ∀s∈S", () => {
    const server = new Server();
    createPromise(server, "p1", 0, { timeoutAt: 50 });
    subscribePromise(server, "p1", "sub1", 0);
    const res = createPromise(server, "p1", 100, { timeoutAt: 50 });
    assert(res.kind === "promise.create");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("rejected_timedout");
    const msgs = server.step({ at: 100 });
    expect(msgs.length).toBe(1);
    expect(msgs[0].mesg.kind).toBe("notify");
    expect(msgs[0].recv).toBe("sub1");
  });

  test("13 -> PromiseCreate | ⟨p, o, ⊥, a, C, S⟩ : t < o → same | 200 | no side effects", () => {
    const server = new Server();
    createPromise(server, "p1", 0, {
      timeoutAt: 100,
      tags: { "resonate:invoke": "default" },
    });
    server.step({ at: 0 });
    const res = createPromise(server, "p1", 50, { timeoutAt: 100 });
    assert(res.kind === "promise.create");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("pending");
    expect(server.step({ at: 50 }).length).toBe(0);
    settlePromise(server, "p1", 51);
  });

  test("14 -> PromiseCreate | ⟨p, o, ⊥, a, C, S⟩ : t ≥ o → ⟨t⟩ | 200 | Enqueue(Resume) ∀c∈C, Send(Notify) ∀s∈S", () => {
    const server = new Server();
    createPromise(server, "awaiter", 0, {
      tags: { "resonate:invoke": "default" },
    });
    createPromise(server, "p1", 0, {
      timeoutAt: 50,
      tags: { "resonate:invoke": "default" },
    });
    server.step({ at: 0 });
    registerPromise(server, "awaiter", "p1", 1);
    subscribePromise(server, "p1", "sub1", 1);

    const res = createPromise(server, "p1", 100, { timeoutAt: 50 });
    assert(res.kind === "promise.create");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("rejected_timedout");

    const msgs = server.step({ at: 100 });
    expect(msgs.length).toBe(2);
    const kinds = msgs.map((m) => m.mesg.kind).sort();
    expect(kinds).toContain("notify");
    expect(kinds).toContain("resume");
    settlePromise(server, "awaiter", 101);
  });

  test("PromiseCreate | ⟨r⟩ → same | 200 | no side effects", () => {
    const server = new Server();
    createPromise(server, "p1", 0);
    settlePromise(server, "p1", 1);
    const res = createPromise(server, "p1", 2);
    assert(res.kind === "promise.create");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("resolved");
    expect(server.step({ at: 2 }).length).toBe(0);
  });

  test("PromiseCreate | ⟨x⟩ → same | 200 | no side effects", () => {
    const server = new Server();
    createPromise(server, "p1", 0);
    settlePromise(server, "p1", 1, "rejected");
    const res = createPromise(server, "p1", 2);
    assert(res.kind === "promise.create");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("rejected");
    expect(server.step({ at: 2 }).length).toBe(0);
  });

  test("PromiseCreate | ⟨c⟩ → same | 200 | no side effects", () => {
    const server = new Server();
    createPromise(server, "p1", 0);
    settlePromise(server, "p1", 1, "rejected_canceled");
    const res = createPromise(server, "p1", 2);
    assert(res.kind === "promise.create");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("rejected_canceled");
    expect(server.step({ at: 2 }).length).toBe(0);
  });

  test("PromiseCreate | ⟨t⟩ → same | 200 | no side effects", () => {
    const server = new Server();
    createPromise(server, "p1", 0, { timeoutAt: 0 });
    const res = createPromise(server, "p1", 1);
    assert(res.kind === "promise.create");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("rejected_timedout");
    expect(server.step({ at: 1 }).length).toBe(0);
  });
});

describe("PromiseCreate(t, o, ⊤, ⊥) - timer (resonate:timeout), no address", () => {
  test("PromiseCreate | ⊥ → ⟨p, o, ⊤, ⊥, ∅, ∅⟩ | 200 | no side effects", () => {
    const server = new Server();
    const res = createPromise(server, "p1", 0, {
      tags: { "resonate:timeout": "true" },
    });
    assert(res.kind === "promise.create");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("pending");
    expect(server.step({ at: 0 }).length).toBe(0);
  });

  test("PromiseCreate(⊤) | ⟨p, o, ⊤, ⊥, ∅, S⟩ : t ≥ o → ⟨r⟩ | 200 | Send(Notify) ∀s∈S", () => {
    const server = new Server();
    createPromise(server, "p1", 0, {
      timeoutAt: 50,
      tags: { "resonate:timeout": "true" },
    });
    subscribePromise(server, "p1", "sub1", 0);
    const res = createPromise(server, "p1", 100, { timeoutAt: 50 });
    assert(res.kind === "promise.create");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("resolved");
    const msgs = server.step({ at: 100 });
    expect(msgs.length).toBe(1);
    expect(msgs[0].mesg.kind).toBe("notify");
  });

  test("PromiseCreate(⊤) | ⟨p, o, ⊤, a, C, S⟩ : t ≥ o → ⟨r⟩ | 200 | Enqueue(Resume) ∀c∈C, Send(Notify) ∀s∈S", () => {
    const server = new Server();
    createPromise(server, "awaiter", 0, {
      tags: { "resonate:invoke": "default" },
    });
    createPromise(server, "p1", 0, {
      timeoutAt: 50,
      tags: { "resonate:invoke": "default", "resonate:timeout": "true" },
    });
    server.step({ at: 0 });
    registerPromise(server, "awaiter", "p1", 1);
    subscribePromise(server, "p1", "sub1", 1);

    const res = createPromise(server, "p1", 100, { timeoutAt: 50 });
    assert(res.kind === "promise.create");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("resolved");

    const msgs = server.step({ at: 100 });
    expect(msgs.length).toBe(2);
    settlePromise(server, "awaiter", 101);
  });
});

describe("PromiseCreate(t, o, ⊥, a) - no timer, with address", () => {
  test("PromiseCreate | ⊥ → ⟨p, o, ⊥, a, ∅, ∅⟩ | 200 | Enqueue(Invoke)", () => {
    const server = new Server();
    const res = createPromise(server, "p1", 0, {
      tags: { "resonate:invoke": "default" },
    });
    assert(res.kind === "promise.create");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("pending");
    const msgs = server.step({ at: 0 });
    expect(msgs.length).toBe(1);
    expect(msgs[0].mesg.kind).toBe("invoke");
    settlePromise(server, "p1", 1);
  });

  test("PromiseCreate(a) | ⟨p, o, ⊥, ⊥, ∅, S⟩ : t < o → same | 200 | no side effects", () => {
    const server = new Server();
    createPromise(server, "p1", 0, { timeoutAt: 100 });
    const res = createPromise(server, "p1", 50, {
      timeoutAt: 100,
      tags: { "resonate:invoke": "default" },
    });
    assert(res.kind === "promise.create");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("pending");
    expect(server.step({ at: 50 }).length).toBe(0);
  });

  test("PromiseCreate(a) | ⟨p, o, ⊥, ⊥, ∅, S⟩ : t ≥ o → ⟨t⟩ | 200 | Send(Notify) ∀s∈S", () => {
    const server = new Server();
    createPromise(server, "p1", 0, { timeoutAt: 50 });
    subscribePromise(server, "p1", "sub1", 0);
    const res = createPromise(server, "p1", 100, {
      timeoutAt: 50,
      tags: { "resonate:invoke": "default" },
    });
    assert(res.kind === "promise.create");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("rejected_timedout");
    const msgs = server.step({ at: 100 });
    expect(msgs.length).toBe(1);
    expect(msgs[0].mesg.kind).toBe("notify");
  });
});

describe("PromiseCreate(t, o, ⊤, a) - timer, with address", () => {
  test("PromiseCreate | ⊥ → ⟨p, o, ⊤, a, ∅, ∅⟩ | 200 | Enqueue(Invoke)", () => {
    const server = new Server();
    const res = createPromise(server, "p1", 0, {
      tags: { "resonate:invoke": "default", "resonate:timeout": "true" },
    });
    assert(res.kind === "promise.create");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("pending");
    const msgs = server.step({ at: 0 });
    expect(msgs.length).toBe(1);
    expect(msgs[0].mesg.kind).toBe("invoke");
    settlePromise(server, "p1", 1);
  });
});

describe("PromiseSettle(t, r) - resolve", () => {
  test("PromiseSettle(r) | ⊥ → ⊥ | 404 | no side effects", () => {
    const server = new Server();
    const res = settlePromise(server, "nonexistent", 0);
    assert(res.kind === "promise.settle");
    assert(isStatus(res, 404));
    expect(server.step({ at: 0 }).length).toBe(0);
  });

  test("PromiseSettle(r) | ⟨p, o, ⊥, ⊥, ∅, S⟩ : t < o → ⟨r⟩ | 200 | Send(Notify) ∀s∈S", () => {
    const server = new Server();
    createPromise(server, "p1", 0, { timeoutAt: 100 });
    subscribePromise(server, "p1", "sub1", 0);
    const res = settlePromise(server, "p1", 50);
    assert(res.kind === "promise.settle");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("resolved");
    const msgs = server.step({ at: 50 });
    expect(msgs.length).toBe(1);
    expect(msgs[0].mesg.kind).toBe("notify");
  });

  test("PromiseSettle(r) | ⟨p, o, ⊥, ⊥, ∅, S⟩ : t ≥ o → ⟨t⟩ | 200 | Send(Notify) ∀s∈S", () => {
    const server = new Server();
    createPromise(server, "p1", 0, { timeoutAt: 50 });
    subscribePromise(server, "p1", "sub1", 0);
    const res = settlePromise(server, "p1", 100);
    assert(res.kind === "promise.settle");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("rejected_timedout");
    const msgs = server.step({ at: 100 });
    expect(msgs.length).toBe(1);
    expect(msgs[0].mesg.kind).toBe("notify");
  });

  test("PromiseSettle(r) | ⟨p, o, ⊥, a, C, S⟩ : t < o → ⟨r⟩ | 200 | Enqueue(Resume) ∀c∈C, Send(Notify) ∀s∈S", () => {
    const server = new Server();
    createPromise(server, "awaiter", 0, {
      tags: { "resonate:invoke": "default" },
    });
    createPromise(server, "p1", 0, {
      timeoutAt: 100,
      tags: { "resonate:invoke": "default" },
    });
    server.step({ at: 0 });
    registerPromise(server, "awaiter", "p1", 1);
    subscribePromise(server, "p1", "sub1", 1);

    const res = settlePromise(server, "p1", 50);
    assert(res.kind === "promise.settle");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("resolved");

    const msgs = server.step({ at: 50 });
    expect(msgs.length).toBe(2);
    const kinds = msgs.map((m) => m.mesg.kind).sort();
    expect(kinds).toContain("notify");
    expect(kinds).toContain("resume");
    settlePromise(server, "awaiter", 51);
  });

  test("PromiseSettle(r) | ⟨p, o, ⊥, a, C, S⟩ : t ≥ o → ⟨t⟩ | 200 | Enqueue(Resume) ∀c∈C, Send(Notify) ∀s∈S", () => {
    const server = new Server();
    createPromise(server, "awaiter", 0, {
      tags: { "resonate:invoke": "default" },
    });
    createPromise(server, "p1", 0, {
      timeoutAt: 50,
      tags: { "resonate:invoke": "default" },
    });
    server.step({ at: 0 });
    registerPromise(server, "awaiter", "p1", 1);
    subscribePromise(server, "p1", "sub1", 1);

    const res = settlePromise(server, "p1", 100);
    assert(res.kind === "promise.settle");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("rejected_timedout");

    const msgs = server.step({ at: 100 });
    expect(msgs.length).toBe(2);
    settlePromise(server, "awaiter", 101);
  });

  test("PromiseSettle(r) | ⟨p, o, ⊤, ⊥, ∅, S⟩ : t < o → ⟨r⟩ | 200 | Send(Notify) ∀s∈S", () => {
    const server = new Server();
    createPromise(server, "p1", 0, {
      timeoutAt: 100,
      tags: { "resonate:timeout": "true" },
    });
    subscribePromise(server, "p1", "sub1", 0);
    const res = settlePromise(server, "p1", 50);
    assert(res.kind === "promise.settle");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("resolved");
    const msgs = server.step({ at: 50 });
    expect(msgs.length).toBe(1);
    expect(msgs[0].mesg.kind).toBe("notify");
  });

  test("PromiseSettle(r) | ⟨p, o, ⊤, ⊥, ∅, S⟩ : t ≥ o → ⟨r⟩ | 200 | Send(Notify) ∀s∈S", () => {
    const server = new Server();
    createPromise(server, "p1", 0, {
      timeoutAt: 50,
      tags: { "resonate:timeout": "true" },
    });
    subscribePromise(server, "p1", "sub1", 0);
    const res = settlePromise(server, "p1", 100);
    assert(res.kind === "promise.settle");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("resolved");
    const msgs = server.step({ at: 100 });
    expect(msgs.length).toBe(1);
  });

  test("PromiseSettle(r) | ⟨p, o, ⊤, a, C, S⟩ : t < o → ⟨r⟩ | 200 | Enqueue(Resume) ∀c∈C, Send(Notify) ∀s∈S", () => {
    const server = new Server();
    createPromise(server, "awaiter", 0, {
      tags: { "resonate:invoke": "default" },
    });
    createPromise(server, "p1", 0, {
      timeoutAt: 100,
      tags: { "resonate:invoke": "default", "resonate:timeout": "true" },
    });
    server.step({ at: 0 });
    registerPromise(server, "awaiter", "p1", 1);
    subscribePromise(server, "p1", "sub1", 1);

    const res = settlePromise(server, "p1", 50);
    assert(res.kind === "promise.settle");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("resolved");

    const msgs = server.step({ at: 50 });
    expect(msgs.length).toBe(2);
    settlePromise(server, "awaiter", 51);
  });

  test("PromiseSettle(r) | ⟨p, o, ⊤, a, C, S⟩ : t ≥ o → ⟨r⟩ | 200 | Enqueue(Resume) ∀c∈C, Send(Notify) ∀s∈S", () => {
    const server = new Server();
    createPromise(server, "awaiter", 0, {
      tags: { "resonate:invoke": "default" },
    });
    createPromise(server, "p1", 0, {
      timeoutAt: 50,
      tags: { "resonate:invoke": "default", "resonate:timeout": "true" },
    });
    server.step({ at: 0 });
    registerPromise(server, "awaiter", "p1", 1);
    subscribePromise(server, "p1", "sub1", 1);

    const res = settlePromise(server, "p1", 100);
    assert(res.kind === "promise.settle");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("resolved");

    const msgs = server.step({ at: 100 });
    expect(msgs.length).toBe(2);
    settlePromise(server, "awaiter", 101);
  });

  test("PromiseSettle(r) | ⟨r⟩ → same | 200 | no side effects", () => {
    const server = new Server();
    createPromise(server, "p1", 0);
    settlePromise(server, "p1", 1);
    const res = settlePromise(server, "p1", 2);
    assert(res.kind === "promise.settle");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("resolved");
    expect(server.step({ at: 2 }).length).toBe(0);
  });

  test("PromiseSettle(r) | ⟨x⟩ → same | 200 | no side effects", () => {
    const server = new Server();
    createPromise(server, "p1", 0);
    settlePromise(server, "p1", 1, "rejected");
    const res = settlePromise(server, "p1", 2);
    assert(res.kind === "promise.settle");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("rejected");
    expect(server.step({ at: 2 }).length).toBe(0);
  });

  test("PromiseSettle(r) | ⟨c⟩ → same | 200 | no side effects", () => {
    const server = new Server();
    createPromise(server, "p1", 0);
    settlePromise(server, "p1", 1, "rejected_canceled");
    const res = settlePromise(server, "p1", 2);
    assert(res.kind === "promise.settle");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("rejected_canceled");
    expect(server.step({ at: 2 }).length).toBe(0);
  });

  test("PromiseSettle(r) | ⟨t⟩ → same | 200 | no side effects", () => {
    const server = new Server();
    createPromise(server, "p1", 0, { timeoutAt: 0 });
    const res = settlePromise(server, "p1", 1);
    assert(res.kind === "promise.settle");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("rejected_timedout");
    expect(server.step({ at: 1 }).length).toBe(0);
  });
});

describe("PromiseSettle(t, x) - reject", () => {
  test("PromiseSettle(x) | ⊥ → ⊥ | 404 | no side effects", () => {
    const server = new Server();
    const res = settlePromise(server, "nonexistent", 0, "rejected");
    assert(res.kind === "promise.settle");
    assert(isStatus(res, 404));
    expect(server.step({ at: 0 }).length).toBe(0);
  });

  test("PromiseSettle(x) | ⟨p, o, ⊥, ⊥, ∅, S⟩ : t < o → ⟨x⟩ | 200 | Send(Notify) ∀s∈S", () => {
    const server = new Server();
    createPromise(server, "p1", 0, { timeoutAt: 100 });
    subscribePromise(server, "p1", "sub1", 0);
    const res = settlePromise(server, "p1", 50, "rejected");
    assert(res.kind === "promise.settle");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("rejected");
    const msgs = server.step({ at: 50 });
    expect(msgs.length).toBe(1);
    expect(msgs[0].mesg.kind).toBe("notify");
  });

  test("PromiseSettle(x) | ⟨p, o, ⊥, ⊥, ∅, S⟩ : t ≥ o → ⟨t⟩ | 200 | Send(Notify) ∀s∈S", () => {
    const server = new Server();
    createPromise(server, "p1", 0, { timeoutAt: 50 });
    subscribePromise(server, "p1", "sub1", 0);
    const res = settlePromise(server, "p1", 100, "rejected");
    assert(res.kind === "promise.settle");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("rejected_timedout");
    const msgs = server.step({ at: 100 });
    expect(msgs.length).toBe(1);
    expect(msgs[0].mesg.kind).toBe("notify");
  });

  test("PromiseSettle(x) | ⟨p, o, ⊤, ⊥, ∅, S⟩ : t < o → ⟨x⟩ | 200 | Send(Notify) ∀s∈S", () => {
    const server = new Server();
    createPromise(server, "p1", 0, {
      timeoutAt: 100,
      tags: { "resonate:timeout": "true" },
    });
    subscribePromise(server, "p1", "sub1", 0);
    const res = settlePromise(server, "p1", 50, "rejected");
    assert(res.kind === "promise.settle");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("rejected");
    const msgs = server.step({ at: 50 });
    expect(msgs.length).toBe(1);
  });

  test("PromiseSettle(x) | ⟨p, o, ⊤, ⊥, ∅, S⟩ : t ≥ o → ⟨r⟩ | 200 | Send(Notify) ∀s∈S", () => {
    const server = new Server();
    createPromise(server, "p1", 0, {
      timeoutAt: 50,
      tags: { "resonate:timeout": "true" },
    });
    subscribePromise(server, "p1", "sub1", 0);
    const res = settlePromise(server, "p1", 100, "rejected");
    assert(res.kind === "promise.settle");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("resolved");
    const msgs = server.step({ at: 100 });
    expect(msgs.length).toBe(1);
  });

  test("PromiseSettle(x) | ⟨r⟩ → same | 200 | no side effects", () => {
    const server = new Server();
    createPromise(server, "p1", 0);
    settlePromise(server, "p1", 1);
    const res = settlePromise(server, "p1", 2, "rejected");
    assert(res.kind === "promise.settle");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("resolved");
    expect(server.step({ at: 2 }).length).toBe(0);
  });

  test("PromiseSettle(x) | ⟨x⟩ → same | 200 | no side effects", () => {
    const server = new Server();
    createPromise(server, "p1", 0);
    settlePromise(server, "p1", 1, "rejected");
    const res = settlePromise(server, "p1", 2, "rejected");
    assert(res.kind === "promise.settle");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("rejected");
    expect(server.step({ at: 2 }).length).toBe(0);
  });

  test("PromiseSettle(x) | ⟨c⟩ → same | 200 | no side effects", () => {
    const server = new Server();
    createPromise(server, "p1", 0);
    settlePromise(server, "p1", 1, "rejected_canceled");
    const res = settlePromise(server, "p1", 2, "rejected");
    assert(res.kind === "promise.settle");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("rejected_canceled");
    expect(server.step({ at: 2 }).length).toBe(0);
  });

  test("PromiseSettle(x) | ⟨t⟩ → same | 200 | no side effects", () => {
    const server = new Server();
    createPromise(server, "p1", 0, { timeoutAt: 0 });
    const res = settlePromise(server, "p1", 1, "rejected");
    assert(res.kind === "promise.settle");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("rejected_timedout");
    expect(server.step({ at: 1 }).length).toBe(0);
  });
});

describe("PromiseSettle(t, c) - cancel", () => {
  test("PromiseSettle(c) | ⊥ → ⊥ | 404 | no side effects", () => {
    const server = new Server();
    const res = settlePromise(server, "nonexistent", 0, "rejected_canceled");
    assert(res.kind === "promise.settle");
    assert(isStatus(res, 404));
    expect(server.step({ at: 0 }).length).toBe(0);
  });

  test("PromiseSettle(c) | ⟨p, o, ⊥, ⊥, ∅, S⟩ : t < o → ⟨c⟩ | 200 | Send(Notify) ∀s∈S", () => {
    const server = new Server();
    createPromise(server, "p1", 0, { timeoutAt: 100 });
    subscribePromise(server, "p1", "sub1", 0);
    const res = settlePromise(server, "p1", 50, "rejected_canceled");
    assert(res.kind === "promise.settle");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("rejected_canceled");
    const msgs = server.step({ at: 50 });
    expect(msgs.length).toBe(1);
    expect(msgs[0].mesg.kind).toBe("notify");
  });

  test("PromiseSettle(c) | ⟨p, o, ⊥, ⊥, ∅, S⟩ : t ≥ o → ⟨t⟩ | 200 | Send(Notify) ∀s∈S", () => {
    const server = new Server();
    createPromise(server, "p1", 0, { timeoutAt: 50 });
    subscribePromise(server, "p1", "sub1", 0);
    const res = settlePromise(server, "p1", 100, "rejected_canceled");
    assert(res.kind === "promise.settle");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("rejected_timedout");
    const msgs = server.step({ at: 100 });
    expect(msgs.length).toBe(1);
    expect(msgs[0].mesg.kind).toBe("notify");
  });

  test("PromiseSettle(c) | ⟨p, o, ⊤, ⊥, ∅, S⟩ : t < o → ⟨c⟩ | 200 | Send(Notify) ∀s∈S", () => {
    const server = new Server();
    createPromise(server, "p1", 0, {
      timeoutAt: 100,
      tags: { "resonate:timeout": "true" },
    });
    subscribePromise(server, "p1", "sub1", 0);
    const res = settlePromise(server, "p1", 50, "rejected_canceled");
    assert(res.kind === "promise.settle");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("rejected_canceled");
    const msgs = server.step({ at: 50 });
    expect(msgs.length).toBe(1);
  });

  test("PromiseSettle(c) | ⟨p, o, ⊤, ⊥, ∅, S⟩ : t ≥ o → ⟨r⟩ | 200 | Send(Notify) ∀s∈S", () => {
    const server = new Server();
    createPromise(server, "p1", 0, {
      timeoutAt: 50,
      tags: { "resonate:timeout": "true" },
    });
    subscribePromise(server, "p1", "sub1", 0);
    const res = settlePromise(server, "p1", 100, "rejected_canceled");
    assert(res.kind === "promise.settle");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("resolved");
    const msgs = server.step({ at: 100 });
    expect(msgs.length).toBe(1);
  });

  test("PromiseSettle(c) | ⟨r⟩ → same | 200 | no side effects", () => {
    const server = new Server();
    createPromise(server, "p1", 0);
    settlePromise(server, "p1", 1);
    const res = settlePromise(server, "p1", 2, "rejected_canceled");
    assert(res.kind === "promise.settle");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("resolved");
    expect(server.step({ at: 2 }).length).toBe(0);
  });

  test("PromiseSettle(c) | ⟨x⟩ → same | 200 | no side effects", () => {
    const server = new Server();
    createPromise(server, "p1", 0);
    settlePromise(server, "p1", 1, "rejected");
    const res = settlePromise(server, "p1", 2, "rejected_canceled");
    assert(res.kind === "promise.settle");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("rejected");
    expect(server.step({ at: 2 }).length).toBe(0);
  });

  test("PromiseSettle(c) | ⟨c⟩ → same | 200 | no side effects", () => {
    const server = new Server();
    createPromise(server, "p1", 0);
    settlePromise(server, "p1", 1, "rejected_canceled");
    const res = settlePromise(server, "p1", 2, "rejected_canceled");
    assert(res.kind === "promise.settle");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("rejected_canceled");
    expect(server.step({ at: 2 }).length).toBe(0);
  });

  test("PromiseSettle(c) | ⟨t⟩ → same | 200 | no side effects", () => {
    const server = new Server();
    createPromise(server, "p1", 0, { timeoutAt: 0 });
    const res = settlePromise(server, "p1", 1, "rejected_canceled");
    assert(res.kind === "promise.settle");
    assert(isStatus(res, 200));
    expect(res.data.promise.state).toBe("rejected_timedout");
    expect(server.step({ at: 1 }).length).toBe(0);
  });
});

describe("PromiseRegister(c) Transitions", () => {
  test("PromiseRegister | ⊥ → ⊥ | 404", () => {
    const server = new Server();
    const res = registerPromise(server, "awaiter", "nonexistent", 0);
    assert(res.kind === "promise.register");
    assert(isStatus(res, 404));
    expect(server.step({ at: 0 }).length).toBe(0);
  });

  test("PromiseRegister | ⟨p, o, ⊥, ⊥, ∅, S⟩ → same | 200 | no side effects", () => {
    const server = new Server();
    createPromise(server, "awaiter", 0);
    createPromise(server, "p1", 0);
    const res = registerPromise(server, "awaiter", "p1", 1);
    assert(res.kind === "promise.register");
    assert(isStatus(res, 200));
    expect(server.step({ at: 1 }).length).toBe(0);
  });

  test("PromiseRegister | ⟨p, o, ⊥, a, C, S⟩ → ⟨p, o, ⊥, a, C::c, S⟩ | 200 | no side effects", () => {
    const server = new Server();
    createPromise(server, "awaiter", 0, {
      tags: { "resonate:invoke": "default" },
    });
    createPromise(server, "p1", 0, { tags: { "resonate:invoke": "default" } });
    server.step({ at: 0 });
    const res = registerPromise(server, "awaiter", "p1", 1);
    assert(res.kind === "promise.register");
    assert(isStatus(res, 200));
    expect(server.step({ at: 1 }).length).toBe(0);
    settlePromise(server, "p1", 2);
    settlePromise(server, "awaiter", 3);
  });

  test("PromiseRegister | ⟨p, o, ⊤, ⊥, ∅, S⟩ → same | 200 | no side effects", () => {
    const server = new Server();
    createPromise(server, "awaiter", 0);
    createPromise(server, "p1", 0, { tags: { "resonate:timeout": "true" } });
    const res = registerPromise(server, "awaiter", "p1", 1);
    assert(res.kind === "promise.register");
    assert(isStatus(res, 200));
    expect(server.step({ at: 1 }).length).toBe(0);
  });

  test("PromiseRegister | ⟨p, o, ⊤, a, C, S⟩ → ⟨p, o, ⊤, a, C::c, S⟩ | 200 | no side effects", () => {
    const server = new Server();
    createPromise(server, "awaiter", 0, {
      tags: { "resonate:invoke": "default" },
    });
    createPromise(server, "p1", 0, {
      tags: { "resonate:invoke": "default", "resonate:timeout": "true" },
    });
    server.step({ at: 0 });
    const res = registerPromise(server, "awaiter", "p1", 1);
    assert(res.kind === "promise.register");
    assert(isStatus(res, 200));
    expect(server.step({ at: 1 }).length).toBe(0);
    settlePromise(server, "p1", 2);
    settlePromise(server, "awaiter", 3);
  });

  test("PromiseRegister | ⟨r⟩ → same | 200 | no side effects", () => {
    const server = new Server();
    createPromise(server, "awaiter", 0);
    createPromise(server, "p1", 0);
    settlePromise(server, "p1", 1);
    const res = registerPromise(server, "awaiter", "p1", 2);
    assert(res.kind === "promise.register");
    assert(isStatus(res, 200));
    expect(server.step({ at: 2 }).length).toBe(0);
  });

  test("PromiseRegister | ⟨x⟩ → same | 200 | no side effects", () => {
    const server = new Server();
    createPromise(server, "awaiter", 0);
    createPromise(server, "p1", 0);
    settlePromise(server, "p1", 1, "rejected");
    const res = registerPromise(server, "awaiter", "p1", 2);
    assert(res.kind === "promise.register");
    assert(isStatus(res, 200));
    expect(server.step({ at: 2 }).length).toBe(0);
  });

  test("PromiseRegister | ⟨c⟩ → same | 200 | no side effects", () => {
    const server = new Server();
    createPromise(server, "awaiter", 0);
    createPromise(server, "p1", 0);
    settlePromise(server, "p1", 1, "rejected_canceled");
    const res = registerPromise(server, "awaiter", "p1", 2);
    assert(res.kind === "promise.register");
    assert(isStatus(res, 200));
    expect(server.step({ at: 2 }).length).toBe(0);
  });

  test("PromiseRegister | ⟨t⟩ → same | 200 | no side effects", () => {
    const server = new Server();
    createPromise(server, "awaiter", 0);
    createPromise(server, "p1", 0, { timeoutAt: 0 });
    const res = registerPromise(server, "awaiter", "p1", 1);
    assert(res.kind === "promise.register");
    assert(isStatus(res, 200));
    expect(server.step({ at: 1 }).length).toBe(0);
  });
});

describe("PromiseSubscribe(s) Transitions", () => {
  test("PromiseSubscribe | ⊥ → ⊥ | 404", () => {
    const server = new Server();
    const res = subscribePromise(server, "nonexistent", "sub1", 0);
    assert(res.kind === "promise.subscribe");
    assert(isStatus(res, 404));
    expect(server.step({ at: 0 }).length).toBe(0);
  });

  test("PromiseSubscribe | ⟨p, o, ⊥, ⊥, ∅, S⟩ → ⟨p, o, ⊥, ⊥, ∅, S::s⟩ | 200 | no side effects", () => {
    const server = new Server();
    createPromise(server, "p1", 0);
    const res = subscribePromise(server, "p1", "sub1", 1);
    assert(res.kind === "promise.subscribe");
    assert(isStatus(res, 200));
    expect(server.step({ at: 1 }).length).toBe(0);
  });

  test("PromiseSubscribe | ⟨p, o, ⊥, a, C, S⟩ → ⟨p, o, ⊥, a, C, S::s⟩ | 200 | no side effects", () => {
    const server = new Server();
    createPromise(server, "p1", 0, { tags: { "resonate:invoke": "default" } });
    server.step({ at: 0 });
    const res = subscribePromise(server, "p1", "sub1", 1);
    assert(res.kind === "promise.subscribe");
    assert(isStatus(res, 200));
    expect(server.step({ at: 1 }).length).toBe(0);
    settlePromise(server, "p1", 2);
  });

  test("PromiseSubscribe | ⟨p, o, ⊤, ⊥, ∅, S⟩ → ⟨p, o, ⊤, ⊥, ∅, S::s⟩ | 200 | no side effects", () => {
    const server = new Server();
    createPromise(server, "p1", 0, { tags: { "resonate:timeout": "true" } });
    const res = subscribePromise(server, "p1", "sub1", 1);
    assert(res.kind === "promise.subscribe");
    assert(isStatus(res, 200));
    expect(server.step({ at: 1 }).length).toBe(0);
  });

  test("PromiseSubscribe | ⟨p, o, ⊤, a, C, S⟩ → ⟨p, o, ⊤, a, C, S::s⟩ | 200 | no side effects", () => {
    const server = new Server();
    createPromise(server, "p1", 0, {
      tags: { "resonate:invoke": "default", "resonate:timeout": "true" },
    });
    server.step({ at: 0 });
    const res = subscribePromise(server, "p1", "sub1", 1);
    assert(res.kind === "promise.subscribe");
    assert(isStatus(res, 200));
    expect(server.step({ at: 1 }).length).toBe(0);
    settlePromise(server, "p1", 2);
  });

  test("PromiseSubscribe | ⟨r⟩ → same | 200 | Send(Notify)", () => {
    const server = new Server();
    createPromise(server, "p1", 0);
    settlePromise(server, "p1", 1);
    const res = subscribePromise(server, "p1", "sub1", 2);
    assert(res.kind === "promise.subscribe");
    assert(isStatus(res, 200));
    const msgs = server.step({ at: 2 });
    expect(msgs.length).toBe(1);
    expect(msgs[0].mesg.kind).toBe("notify");
    expect(msgs[0].recv).toBe("sub1");
  });

  test("PromiseSubscribe | ⟨x⟩ → same | 200 | Send(Notify)", () => {
    const server = new Server();
    createPromise(server, "p1", 0);
    settlePromise(server, "p1", 1, "rejected");
    const res = subscribePromise(server, "p1", "sub1", 2);
    assert(res.kind === "promise.subscribe");
    assert(isStatus(res, 200));
    const msgs = server.step({ at: 2 });
    expect(msgs.length).toBe(1);
    expect(msgs[0].mesg.kind).toBe("notify");
    expect(msgs[0].recv).toBe("sub1");
  });

  test("PromiseSubscribe | ⟨c⟩ → same | 200 | Send(Notify)", () => {
    const server = new Server();
    createPromise(server, "p1", 0);
    settlePromise(server, "p1", 1, "rejected_canceled");
    const res = subscribePromise(server, "p1", "sub1", 2);
    assert(res.kind === "promise.subscribe");
    assert(isStatus(res, 200));
    const msgs = server.step({ at: 2 });
    expect(msgs.length).toBe(1);
    expect(msgs[0].mesg.kind).toBe("notify");
    expect(msgs[0].recv).toBe("sub1");
  });

  test("PromiseSubscribe | ⟨t⟩ → same | 200 | Send(Notify)", () => {
    const server = new Server();
    createPromise(server, "p1", 0, { timeoutAt: 0 });
    const res = subscribePromise(server, "p1", "sub1", 1);
    assert(res.kind === "promise.subscribe");
    assert(isStatus(res, 200));
    const msgs = server.step({ at: 1 });
    expect(msgs.length).toBe(1);
    expect(msgs[0].mesg.kind).toBe("notify");
    expect(msgs[0].recv).toBe("sub1");
  });
});
