import { describe, expect, test } from "bun:test";
import { Server } from "../src";
import { assert } from "../src/utils";

describe("promise transitions", () => {
  test("<id>: <operation> from <state> to <state> returns <status>. with <side-effects-if-present>", () => {
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
});
