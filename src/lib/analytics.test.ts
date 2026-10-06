import { describe, expect, test, beforeEach } from "vitest";
import { track, getEvents, getAnonId, resetEvents } from "./analytics";

describe("analytics.track", () => {
  beforeEach(() => resetEvents());

  test("事件进入内存队列并带匿名 ID", () => {
    track("example_click");
    const events = getEvents();
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("example_click");
    expect(events[0].anonId).toBe(getAnonId());
    expect(typeof events[0].ts).toBe("number");
  });

  test("隐私：amountUsd 明文不入队（PRD 埋点表约束）", () => {
    track("portfolio_submitted", { positions: 3, hasCrypto: true, amountUsd: 99999 });
    const e = getEvents()[0];
    expect(e.props.amountUsd).toBeUndefined();
    expect(e.props.positions).toBe(3);
  });

  test("环形队列：超过 100 条丢弃最旧", () => {
    for (let i = 0; i < 105; i++) track("page_view", { i });
    const events = getEvents();
    expect(events).toHaveLength(100);
    expect(events[0].props.i).toBe(5);
  });

  test("匿名 ID 稳定（同会话重复获取相同）", () => {
    expect(getAnonId()).toBe(getAnonId());
    expect(String(getAnonId()).length).toBeGreaterThan(0);
  });
});
