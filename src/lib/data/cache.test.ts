import { describe, expect, test } from "vitest";
import { TTLCache } from "./cache";

describe("TTLCache", () => {
  test("命中与未命中", () => {
    const c = new TTLCache(12 * 3600 * 1000, () => 1000);
    c.set("k", { a: 1 });
    expect(c.get("k")).toEqual({ a: 1 });
    expect(c.get("missing")).toBeUndefined();
  });

  test("TTL 过期后不可读（注入时钟）", () => {
    let now = 1000;
    const c = new TTLCache(12 * 3600 * 1000, () => now);
    c.set("k", "v");
    now += 12 * 3600 * 1000 - 1;
    expect(c.get("k")).toBe("v");
    now += 1;
    expect(c.get("k")).toBeUndefined();
  });
});
