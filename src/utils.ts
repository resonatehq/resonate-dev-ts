import type { Res } from "./api";

export function assert(cond: boolean, msg?: string): asserts cond {
  if (cond) return;

  console.assert(cond, "Assertion Failed: %s", msg);
  console.trace();

  if (typeof process !== "undefined" && process.versions.node) {
    process.exit(1);
  }
}

export function assertDefined<T>(val: T | undefined | null): asserts val is T {
  assert(val !== null && val !== undefined, "value must not be null");
}

type ExtractByStatus<R, S> = R extends { head: { status: infer T } }
  ? S extends T
    ? R
    : never
  : never;

export function isStatus<R extends Res, S extends R["head"]["status"]>(
  res: R,
  status: S,
): res is ExtractByStatus<R, S> {
  return res.head.status === status;
}
