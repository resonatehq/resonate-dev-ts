import { describe, expect, test } from "bun:test";
import { Server } from "../src/server";

describe("promise transitions", () => {
  test("transition from init to pending via create", () => {
    const server = new Server();
    const res = server.process({
      at: 0,
      req: {
        kind: "promise.create",
        head: { corrId: "req0", version: "2025-01-15" },
        data: {
          id: "id0",
          param: { headers: {}, data: "" },
          tags: {},
          timeoutAt: Number.MAX_SAFE_INTEGER,
        },
      },
    });
    expect(res.kind).toBe("promise.create");
  });
});
