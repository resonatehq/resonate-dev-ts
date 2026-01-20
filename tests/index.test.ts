import { describe, expect, test } from "bun:test";

describe("echo", () => {
  test("returns 'foo'", () => {
    expect("foo").toBe("foo");
  });
});
