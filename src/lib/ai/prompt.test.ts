import { describe, expect, test } from "vitest";
import { buildPrompt } from "./prompt";
import type { EngineOutput } from "@/lib/types";

const ENGINE = { metrics: {}, scenarios: [], score: { total: 3.9, detail: [] } } as unknown as EngineOutput;

describe("buildPrompt", () => {
  test("数字红线写入 system：禁换算/禁四舍五入/禁区间表述", () => {
    const { system } = buildPrompt(ENGINE);
    expect(system).toContain("四舍五入");
    expect(system).toContain("万");
    expect(system).toContain("区间表述");
    expect(system).toContain("不构成投资建议");
  });

  test("逃生通道与语义钉死：拿不准就不写数字；指数名称照抄", () => {
    const { system } = buildPrompt(ENGINE);
    expect(system).toContain("就不要写数字");
    expect(system).toContain("恒生指数");
    expect(system).toContain("推算资产余额");
  });

  test("user 包含引擎 JSON 数据（人性化舍入，无全精度浮点）", () => {
    const engine = {
      metrics: { maxDrawdown: 0.2755607702085493, var95Usd: 35977.981735890266 },
      scenarios: [],
      score: { total: 3.9, detail: [] },
    } as unknown as EngineOutput;
    const { user } = buildPrompt(engine);
    expect(user).toContain("0.2756"); // |n|<1 → 4 位小数
    expect(user).toContain("35977.98"); // |n|≥1 → 2 位小数
    expect(user).not.toContain("0.2755607702085493");
    expect(user).not.toContain("35977.981735890266");
    expect(user).toContain("3.9");
  });
});
