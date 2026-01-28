import { describe, expect, test } from "bun:test";
import { Server } from "../src";
import { assert } from "../src/utils";

describe("promise transitions", () => {
  test("0: transition from init to pending via create", () => {
    const server = new Server();
    const res = server.process({
      at: 0,
      req: {
        kind: "promise.create",
        head: { corrId: "", version: server.version },
        data: {
          id: "id0",
          param: { headers: {}, data: "" },
          tags: {},
          timeoutAt: Number.MAX_SAFE_INTEGER,
        },
      },
    });
    expect(res.kind).toBe("promise.create");
    assert(res.kind === "promise.create");
    expect(res.data.promise.id).toBe("id0");
    expect(res.data.promise.state).toBe("pending");
  });
  test("1: transition from init to init via reject", () => {
    const server = new Server();
    const res = server.process({
      at: 0,
      req: {
        kind: "promise.settle",
        head: { corrId: "", version: server.version },
        data: {
          id: "id1",
          state: "rejected",
          value: { headers: {}, data: "" },
        },
      },
    });
    expect(res.kind).toBe("error");
    assert(res.kind === "error");
    expect(res.head.status).toBe(404);
    expect(res.data).toBe("promise not found");
  });
  test("2: transition from init to init via resolve", () => {
    const server = new Server();
    const res = server.process({
      at: 0,
      req: {
        kind: "promise.settle",
        head: { corrId: "", version: server.version },
        data: {
          id: "id2",
          state: "resolved",
          value: { headers: {}, data: "" },
        },
      },
    });
    expect(res.kind).toBe("error");
    assert(res.kind === "error");
    expect(res.head.status).toBe(404);
    expect(res.data).toBe("promise not found");
  });
  test("3: transition from init to init via cancel", () => {
    const server = new Server();
    const res = server.process({
      at: 0,
      req: {
        kind: "promise.settle",
        head: { corrId: "", version: server.version },
        data: {
          id: "id3",
          state: "rejected_canceled",
          value: { headers: {}, data: "" },
        },
      },
    });
    expect(res.kind).toBe("error");
    assert(res.kind === "error");
    expect(res.head.status).toBe(404);
    expect(res.data).toBe("promise not found");
  });
  test("4: transition from pending to pending via create", () => {
    const server = new Server();
    const createRes = server.process({
      at: 0,
      req: {
        kind: "promise.create",
        head: { corrId: "", version: server.version },
        data: {
          id: "id4",
          param: { headers: {}, data: "" },
          tags: {},
          timeoutAt: Number.MAX_SAFE_INTEGER,
        },
      },
    });
    expect(createRes.kind).not.toBe("error");

    const res = server.process({
      at: 1,
      req: {
        kind: "promise.create",
        head: { corrId: "", version: server.version },
        data: {
          id: "id4",
          param: { headers: {}, data: "" },
          tags: {},
          timeoutAt: Number.MAX_SAFE_INTEGER,
        },
      },
    });
    expect(res.kind).toBe("promise.create");
    assert(res.kind === "promise.create");
    expect(res.data.promise.id).toBe("id4");
    expect(res.data.promise.state).toBe("pending");
  });
  test("5: transitions from pending to resolved via resolve", () => {
    const server = new Server();
    const createRes = server.process({
      at: 0,
      req: {
        kind: "promise.create",
        head: { corrId: "", version: server.version },
        data: {
          id: "id5",
          param: { headers: {}, data: "" },
          tags: {},
          timeoutAt: Number.MAX_SAFE_INTEGER,
        },
      },
    });
    expect(createRes.kind).not.toBe("error");

    const res = server.process({
      at: 1,
      req: {
        kind: "promise.settle",
        head: { corrId: "", version: server.version },
        data: {
          id: "id5",
          state: "resolved",
          value: { headers: {}, data: "" },
        },
      },
    });
    expect(res.kind).toBe("promise.settle");
    assert(res.kind === "promise.settle");
    expect(res.data.promise.id).toBe("id5");
    expect(res.data.promise.state).toBe("resolved");
  });
  test("6: transitions from pending to rejected via reject", () => {
    const server = new Server();
    const createRes = server.process({
      at: 0,
      req: {
        kind: "promise.create",
        head: { corrId: "", version: server.version },
        data: {
          id: "id6",
          param: { headers: {}, data: "" },
          tags: {},
          timeoutAt: Number.MAX_SAFE_INTEGER,
        },
      },
    });
    expect(createRes.kind).not.toBe("error");

    const res = server.process({
      at: 1,
      req: {
        kind: "promise.settle",
        head: { corrId: "", version: server.version },
        data: {
          id: "id6",
          state: "rejected",
          value: { headers: {}, data: "" },
        },
      },
    });
    expect(res.kind).toBe("promise.settle");
    assert(res.kind === "promise.settle");
    expect(res.data.promise.id).toBe("id6");
    expect(res.data.promise.state).toBe("rejected");
  });
  test("7: transitions from pending to canceled via cancel", () => {
    const server = new Server();
    const createRes = server.process({
      at: 0,
      req: {
        kind: "promise.create",
        head: { corrId: "", version: server.version },
        data: {
          id: "id7",
          param: { headers: {}, data: "" },
          tags: {},
          timeoutAt: Number.MAX_SAFE_INTEGER,
        },
      },
    });
    expect(createRes.kind).not.toBe("error");

    const res = server.process({
      at: 1,
      req: {
        kind: "promise.settle",
        head: { corrId: "", version: server.version },
        data: {
          id: "id7",
          state: "rejected_canceled",
          value: { headers: {}, data: "" },
        },
      },
    });
    expect(res.kind).toBe("promise.settle");
    assert(res.kind === "promise.settle");
    expect(res.data.promise.id).toBe("id7");
    expect(res.data.promise.state).toBe("rejected_canceled");
  });
  test("8: transitions from resolved to resolved via create", () => {
    const server = new Server();
    const createRes = server.process({
      at: 0,
      req: {
        kind: "promise.create",
        head: { corrId: "", version: server.version },
        data: {
          id: "id8",
          param: { headers: {}, data: "" },
          tags: {},
          timeoutAt: Number.MAX_SAFE_INTEGER,
        },
      },
    });
    expect(createRes.kind).not.toBe("error");

    const settleRes = server.process({
      at: 1,
      req: {
        kind: "promise.settle",
        head: { corrId: "", version: server.version },
        data: {
          id: "id8",
          state: "resolved",
          value: { headers: {}, data: "" },
        },
      },
    });
    expect(settleRes.kind).not.toBe("error");

    const res = server.process({
      at: 2,
      req: {
        kind: "promise.create",
        head: { corrId: "", version: server.version },
        data: {
          id: "id8",
          param: { headers: {}, data: "" },
          tags: {},
          timeoutAt: Number.MAX_SAFE_INTEGER,
        },
      },
    });
    expect(res.kind).toBe("promise.create");
    assert(res.kind === "promise.create");
    expect(res.data.promise.id).toBe("id8");
    expect(res.data.promise.state).toBe("resolved");
  });
  test("9: transitions from resolved to resolved via resolve", () => {
    const server = new Server();
    const createRes = server.process({
      at: 0,
      req: {
        kind: "promise.create",
        head: { corrId: "", version: server.version },
        data: {
          id: "id9",
          param: { headers: {}, data: "" },
          tags: {},
          timeoutAt: Number.MAX_SAFE_INTEGER,
        },
      },
    });
    expect(createRes.kind).not.toBe("error");

    const settleRes = server.process({
      at: 1,
      req: {
        kind: "promise.settle",
        head: { corrId: "", version: server.version },
        data: {
          id: "id9",
          state: "resolved",
          value: { headers: {}, data: "" },
        },
      },
    });
    expect(settleRes.kind).not.toBe("error");

    const res = server.process({
      at: 2,
      req: {
        kind: "promise.settle",
        head: { corrId: "", version: server.version },
        data: {
          id: "id9",
          state: "resolved",
          value: { headers: {}, data: "" },
        },
      },
    });
    expect(res.kind).toBe("promise.settle");
    assert(res.kind === "promise.settle");
    expect(res.data.promise.id).toBe("id9");
    expect(res.data.promise.state).toBe("resolved");
  });
  test("10: transitions from resolved to resolved via reject", () => {
    const server = new Server();
    const createRes = server.process({
      at: 0,
      req: {
        kind: "promise.create",
        head: { corrId: "", version: server.version },
        data: {
          id: "id10",
          param: { headers: {}, data: "" },
          tags: {},
          timeoutAt: Number.MAX_SAFE_INTEGER,
        },
      },
    });
    expect(createRes.kind).not.toBe("error");

    const settleRes = server.process({
      at: 1,
      req: {
        kind: "promise.settle",
        head: { corrId: "", version: server.version },
        data: {
          id: "id10",
          state: "resolved",
          value: { headers: {}, data: "" },
        },
      },
    });
    expect(settleRes.kind).not.toBe("error");

    const res = server.process({
      at: 2,
      req: {
        kind: "promise.settle",
        head: { corrId: "", version: server.version },
        data: {
          id: "id10",
          state: "rejected",
          value: { headers: {}, data: "" },
        },
      },
    });
    expect(res.kind).toBe("promise.settle");
    assert(res.kind === "promise.settle");
    expect(res.data.promise.id).toBe("id10");
    expect(res.data.promise.state).toBe("resolved");
  });
  test("11: transitions from resolved to resolved via cancel", () => {
    const server = new Server();
    const createRes = server.process({
      at: 0,
      req: {
        kind: "promise.create",
        head: { corrId: "", version: server.version },
        data: {
          id: "id11",
          param: { headers: {}, data: "" },
          tags: {},
          timeoutAt: Number.MAX_SAFE_INTEGER,
        },
      },
    });
    expect(createRes.kind).not.toBe("error");

    const settleRes = server.process({
      at: 1,
      req: {
        kind: "promise.settle",
        head: { corrId: "", version: server.version },
        data: {
          id: "id11",
          state: "resolved",
          value: { headers: {}, data: "" },
        },
      },
    });
    expect(settleRes.kind).not.toBe("error");

    const res = server.process({
      at: 2,
      req: {
        kind: "promise.settle",
        head: { corrId: "", version: server.version },
        data: {
          id: "id11",
          state: "rejected_canceled",
          value: { headers: {}, data: "" },
        },
      },
    });
    expect(res.kind).toBe("promise.settle");
    assert(res.kind === "promise.settle");
    expect(res.data.promise.id).toBe("id11");
    expect(res.data.promise.state).toBe("resolved");
  });
  test("12: transitions from rejected to rejected via create", () => {
    const server = new Server();
    const createRes = server.process({
      at: 0,
      req: {
        kind: "promise.create",
        head: { corrId: "", version: server.version },
        data: {
          id: "id12",
          param: { headers: {}, data: "" },
          tags: {},
          timeoutAt: Number.MAX_SAFE_INTEGER,
        },
      },
    });
    expect(createRes.kind).not.toBe("error");

    const settleRes = server.process({
      at: 1,
      req: {
        kind: "promise.settle",
        head: { corrId: "", version: server.version },
        data: {
          id: "id12",
          state: "rejected",
          value: { headers: {}, data: "" },
        },
      },
    });
    expect(settleRes.kind).not.toBe("error");

    const res = server.process({
      at: 2,
      req: {
        kind: "promise.create",
        head: { corrId: "", version: server.version },
        data: {
          id: "id12",
          param: { headers: {}, data: "" },
          tags: {},
          timeoutAt: Number.MAX_SAFE_INTEGER,
        },
      },
    });
    expect(res.kind).toBe("promise.create");
    assert(res.kind === "promise.create");
    expect(res.data.promise.id).toBe("id12");
    expect(res.data.promise.state).toBe("rejected");
  });
  test("13: transitions from rejected to rejected via resolve", () => {
    const server = new Server();
    const createRes = server.process({
      at: 0,
      req: {
        kind: "promise.create",
        head: { corrId: "", version: server.version },
        data: {
          id: "id13",
          param: { headers: {}, data: "" },
          tags: {},
          timeoutAt: Number.MAX_SAFE_INTEGER,
        },
      },
    });
    expect(createRes.kind).not.toBe("error");

    const settleRes = server.process({
      at: 1,
      req: {
        kind: "promise.settle",
        head: { corrId: "", version: server.version },
        data: {
          id: "id13",
          state: "rejected",
          value: { headers: {}, data: "" },
        },
      },
    });
    expect(settleRes.kind).not.toBe("error");

    const res = server.process({
      at: 2,
      req: {
        kind: "promise.settle",
        head: { corrId: "", version: server.version },
        data: {
          id: "id13",
          state: "resolved",
          value: { headers: {}, data: "" },
        },
      },
    });
    expect(res.kind).toBe("promise.settle");
    assert(res.kind === "promise.settle");
    expect(res.data.promise.id).toBe("id13");
    expect(res.data.promise.state).toBe("rejected");
  });
  test("14: transitions from rejected to rejected via reject", () => {
    const server = new Server();
    const createRes = server.process({
      at: 0,
      req: {
        kind: "promise.create",
        head: { corrId: "", version: server.version },
        data: {
          id: "id14",
          param: { headers: {}, data: "" },
          tags: {},
          timeoutAt: Number.MAX_SAFE_INTEGER,
        },
      },
    });
    expect(createRes.kind).not.toBe("error");

    const settleRes = server.process({
      at: 1,
      req: {
        kind: "promise.settle",
        head: { corrId: "", version: server.version },
        data: {
          id: "id14",
          state: "rejected",
          value: { headers: {}, data: "" },
        },
      },
    });
    expect(settleRes.kind).not.toBe("error");

    const res = server.process({
      at: 2,
      req: {
        kind: "promise.settle",
        head: { corrId: "", version: server.version },
        data: {
          id: "id14",
          state: "rejected",
          value: { headers: {}, data: "" },
        },
      },
    });
    expect(res.kind).toBe("promise.settle");
    assert(res.kind === "promise.settle");
    expect(res.data.promise.id).toBe("id14");
    expect(res.data.promise.state).toBe("rejected");
  });
  test("15: transitions from rejected to rejected via cancel", () => {
    const server = new Server();
    const createRes = server.process({
      at: 0,
      req: {
        kind: "promise.create",
        head: { corrId: "", version: server.version },
        data: {
          id: "id15",
          param: { headers: {}, data: "" },
          tags: {},
          timeoutAt: Number.MAX_SAFE_INTEGER,
        },
      },
    });
    expect(createRes.kind).not.toBe("error");

    const settleRes = server.process({
      at: 1,
      req: {
        kind: "promise.settle",
        head: { corrId: "", version: server.version },
        data: {
          id: "id15",
          state: "rejected",
          value: { headers: {}, data: "" },
        },
      },
    });
    expect(settleRes.kind).not.toBe("error");

    const res = server.process({
      at: 2,
      req: {
        kind: "promise.settle",
        head: { corrId: "", version: server.version },
        data: {
          id: "id15",
          state: "rejected_canceled",
          value: { headers: {}, data: "" },
        },
      },
    });
    expect(res.kind).toBe("promise.settle");
    assert(res.kind === "promise.settle");
    expect(res.data.promise.id).toBe("id15");
    expect(res.data.promise.state).toBe("rejected");
  });
  test("16: transitions from canceled to canceled via create", () => {
    const server = new Server();
    const createRes = server.process({
      at: 0,
      req: {
        kind: "promise.create",
        head: { corrId: "", version: server.version },
        data: {
          id: "id16",
          param: { headers: {}, data: "" },
          tags: {},
          timeoutAt: Number.MAX_SAFE_INTEGER,
        },
      },
    });
    expect(createRes.kind).not.toBe("error");

    const settleRes = server.process({
      at: 1,
      req: {
        kind: "promise.settle",
        head: { corrId: "", version: server.version },
        data: {
          id: "id16",
          state: "rejected_canceled",
          value: { headers: {}, data: "" },
        },
      },
    });
    expect(settleRes.kind).not.toBe("error");

    const res = server.process({
      at: 2,
      req: {
        kind: "promise.create",
        head: { corrId: "", version: server.version },
        data: {
          id: "id16",
          param: { headers: {}, data: "" },
          tags: {},
          timeoutAt: Number.MAX_SAFE_INTEGER,
        },
      },
    });
    expect(res.kind).toBe("promise.create");
    assert(res.kind === "promise.create");
    expect(res.data.promise.id).toBe("id16");
    expect(res.data.promise.state).toBe("rejected_canceled");
  });
  test("17: transitions from canceled to canceled via resolve", () => {
    const server = new Server();
    const createRes = server.process({
      at: 0,
      req: {
        kind: "promise.create",
        head: { corrId: "", version: server.version },
        data: {
          id: "id17",
          param: { headers: {}, data: "" },
          tags: {},
          timeoutAt: Number.MAX_SAFE_INTEGER,
        },
      },
    });
    expect(createRes.kind).not.toBe("error");

    const settleRes = server.process({
      at: 1,
      req: {
        kind: "promise.settle",
        head: { corrId: "", version: server.version },
        data: {
          id: "id17",
          state: "rejected_canceled",
          value: { headers: {}, data: "" },
        },
      },
    });
    expect(settleRes.kind).not.toBe("error");

    const res = server.process({
      at: 2,
      req: {
        kind: "promise.settle",
        head: { corrId: "", version: server.version },
        data: {
          id: "id17",
          state: "resolved",
          value: { headers: {}, data: "" },
        },
      },
    });
    expect(res.kind).toBe("promise.settle");
    assert(res.kind === "promise.settle");
    expect(res.data.promise.id).toBe("id17");
    expect(res.data.promise.state).toBe("rejected_canceled");
  });
  test("18: transitions from canceled to canceled via reject", () => {
    const server = new Server();
    const createRes = server.process({
      at: 0,
      req: {
        kind: "promise.create",
        head: { corrId: "", version: server.version },
        data: {
          id: "id18",
          param: { headers: {}, data: "" },
          tags: {},
          timeoutAt: Number.MAX_SAFE_INTEGER,
        },
      },
    });
    expect(createRes.kind).not.toBe("error");

    const settleRes = server.process({
      at: 1,
      req: {
        kind: "promise.settle",
        head: { corrId: "", version: server.version },
        data: {
          id: "id18",
          state: "rejected_canceled",
          value: { headers: {}, data: "" },
        },
      },
    });
    expect(settleRes.kind).not.toBe("error");

    const res = server.process({
      at: 2,
      req: {
        kind: "promise.settle",
        head: { corrId: "", version: server.version },
        data: {
          id: "id18",
          state: "rejected",
          value: { headers: {}, data: "" },
        },
      },
    });
    expect(res.kind).toBe("promise.settle");
    assert(res.kind === "promise.settle");
    expect(res.data.promise.id).toBe("id18");
    expect(res.data.promise.state).toBe("rejected_canceled");
  });
  test("19: transitions from canceled to canceled via cancel", () => {
    const server = new Server();
    const createRes = server.process({
      at: 0,
      req: {
        kind: "promise.create",
        head: { corrId: "", version: server.version },
        data: {
          id: "id19",
          param: { headers: {}, data: "" },
          tags: {},
          timeoutAt: Number.MAX_SAFE_INTEGER,
        },
      },
    });
    expect(createRes.kind).not.toBe("error");

    const settleRes = server.process({
      at: 1,
      req: {
        kind: "promise.settle",
        head: { corrId: "", version: server.version },
        data: {
          id: "id19",
          state: "rejected_canceled",
          value: { headers: {}, data: "" },
        },
      },
    });
    expect(settleRes.kind).not.toBe("error");

    const res = server.process({
      at: 2,
      req: {
        kind: "promise.settle",
        head: { corrId: "", version: server.version },
        data: {
          id: "id19",
          state: "rejected_canceled",
          value: { headers: {}, data: "" },
        },
      },
    });
    expect(res.kind).toBe("promise.settle");
    assert(res.kind === "promise.settle");
    expect(res.data.promise.id).toBe("id19");
    expect(res.data.promise.state).toBe("rejected_canceled");
  });
  test("20: transitions from timedout to timedout via create", () => {
    const server = new Server();
    const createRes = server.process({
      at: 0,
      req: {
        kind: "promise.create",
        head: { corrId: "", version: server.version },
        data: {
          id: "id20",
          param: { headers: {}, data: "" },
          tags: {},
          timeoutAt: 0,
        },
      },
    });
    expect(createRes.kind).not.toBe("error");

    const res = server.process({
      at: 1,
      req: {
        kind: "promise.create",
        head: { corrId: "", version: server.version },
        data: {
          id: "id20",
          param: { headers: {}, data: "" },
          tags: {},
          timeoutAt: Number.MAX_SAFE_INTEGER,
        },
      },
    });
    expect(res.kind).toBe("promise.create");
    assert(res.kind === "promise.create");
    expect(res.data.promise.id).toBe("id20");
    expect(res.data.promise.state).toBe("rejected_timedout");
  });
  test("21: transitions from timedout to timedout via resolve", () => {
    const server = new Server();
    const createRes = server.process({
      at: 0,
      req: {
        kind: "promise.create",
        head: { corrId: "", version: server.version },
        data: {
          id: "id21",
          param: { headers: {}, data: "" },
          tags: {},
          timeoutAt: 0,
        },
      },
    });
    expect(createRes.kind).not.toBe("error");

    const res = server.process({
      at: 1,
      req: {
        kind: "promise.settle",
        head: { corrId: "", version: server.version },
        data: {
          id: "id21",
          state: "resolved",
          value: { headers: {}, data: "" },
        },
      },
    });
    expect(res.kind).toBe("promise.settle");
    assert(res.kind === "promise.settle");
    expect(res.data.promise.id).toBe("id21");
    expect(res.data.promise.state).toBe("rejected_timedout");
  });
  test("22: transitions from timedout to timedout via reject", () => {
    const server = new Server();
    const createRes = server.process({
      at: 0,
      req: {
        kind: "promise.create",
        head: { corrId: "", version: server.version },
        data: {
          id: "id22",
          param: { headers: {}, data: "" },
          tags: {},
          timeoutAt: 0,
        },
      },
    });
    expect(createRes.kind).not.toBe("error");

    const res = server.process({
      at: 1,
      req: {
        kind: "promise.settle",
        head: { corrId: "", version: server.version },
        data: {
          id: "id22",
          state: "rejected",
          value: { headers: {}, data: "" },
        },
      },
    });
    expect(res.kind).toBe("promise.settle");
    assert(res.kind === "promise.settle");
    expect(res.data.promise.id).toBe("id22");
    expect(res.data.promise.state).toBe("rejected_timedout");
  });
  test("23: transitions from timedout to timedout via cancel", () => {
    const server = new Server();
    const createRes = server.process({
      at: 0,
      req: {
        kind: "promise.create",
        head: { corrId: "", version: server.version },
        data: {
          id: "id23",
          param: { headers: {}, data: "" },
          tags: {},
          timeoutAt: 0,
        },
      },
    });
    expect(createRes.kind).not.toBe("error");

    const res = server.process({
      at: 1,
      req: {
        kind: "promise.settle",
        head: { corrId: "", version: server.version },
        data: {
          id: "id23",
          state: "rejected_canceled",
          value: { headers: {}, data: "" },
        },
      },
    });
    expect(res.kind).toBe("promise.settle");
    assert(res.kind === "promise.settle");
    expect(res.data.promise.id).toBe("id23");
    expect(res.data.promise.state).toBe("rejected_timedout");
  });
});
