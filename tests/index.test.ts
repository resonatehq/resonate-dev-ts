import { describe, expect, test } from "bun:test";
import { foo } from "../src/index";

describe("foo", () => {
  test("returns 'foo'", () => {
    expect(foo()).toBe("foo");
  });
});
