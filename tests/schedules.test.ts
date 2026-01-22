import { describe, expect, test } from "bun:test";
import { assert, Server, VERSION } from "../src";

describe("schedule transitions", () => {
  test("0: create and get", () => {
    const server = new Server();
    const createRes = server.process({
      at: 0,
      req: {
        kind: "schedule.create",
        head: { corrId: "", version: VERSION },
        data: {
          id: "s0",
          cron: "0 * * * *",
          promiseId: "foo",
          promiseTimeout: Number.MAX_SAFE_INTEGER,
          promiseParam: { headers: {}, data: "" },
          promiseTags: {},
        },
      },
    });
    expect(createRes.kind).toBe("schedule.create");
    assert(createRes.kind === "schedule.create");

    const getRes = server.process({
      at: 1,
      req: {
        kind: "schedule.get",
        head: { corrId: "", version: VERSION },
        data: {
          id: createRes.data.schedule.id,
        },
      },
    });
    expect(getRes.kind).toBe("schedule.get");
    assert(getRes.kind === "schedule.get");
    expect(getRes.data.schedule).toEqual(createRes.data.schedule);
  });

  test("1: create twice", () => {
    const server = new Server();
    const createRes1 = server.process({
      at: 0,
      req: {
        kind: "schedule.create",
        head: { corrId: "", version: VERSION },
        data: {
          id: "s1",
          cron: "* * * * *",
          promiseId: "foo",
          promiseTimeout: 10,
          promiseParam: { headers: {}, data: "" },
          promiseTags: {},
        },
      },
    });
    expect(createRes1.kind).toBe("schedule.create");
    assert(createRes1.kind === "schedule.create");

    const createRes2 = server.process({
      at: 1,
      req: {
        kind: "schedule.create",
        head: { corrId: "", version: VERSION },
        data: {
          id: "s1",
          cron: "* 2 * * *",
          promiseId: "bar",
          promiseTimeout: 10,
          promiseParam: { headers: {}, data: "" },
          promiseTags: {},
        },
      },
    });
    expect(createRes2.kind).toBe("schedule.create");
    assert(createRes2.kind === "schedule.create");

    const getRes = server.process({
      at: 2,
      req: {
        kind: "schedule.get",
        head: { corrId: "", version: VERSION },
        data: {
          id: "s1",
        },
      },
    });
    expect(getRes.kind).toBe("schedule.get");
    assert(getRes.kind === "schedule.get");
    expect(getRes.data.schedule).toEqual(createRes1.data.schedule);
  });
});
