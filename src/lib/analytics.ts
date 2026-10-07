// 匿名埋点（PRD §2 埋点表）。V1 仅内存队列 + 控制台；上线后可桥接到 Vercel Analytics。
// 隐私约束：不采集 PII；金额（amountUsd）明文禁止入队。

export type EventName =
  | "page_view"
  | "example_click"
  | "portfolio_submitted"
  | "report_completed"
  | "report_scrolled_bottom"
  | "ai_disclosure_open"
  | "share_card_open"
  | "report_failed";

export interface TrackedEvent {
  event: EventName;
  props: Record<string, unknown>;
  anonId: string;
  ts: number;
}

const RING_SIZE = 100;
let ring: TrackedEvent[] = [];
let anonId: string | null = null;

const STRIPPED_KEYS = new Set(["amountUsd", "amount", "usd"]);

/** 落库分发器：生产环境由 Vercel Analytics 承载，测试可注入 mock。 */
type Dispatcher = (event: EventName, props: Record<string, unknown>) => void;
let dispatcher: Dispatcher | null = null;

export function setDispatcher(fn: Dispatcher | null): void {
  dispatcher = fn;
}

function defaultDispatcher(event: EventName, props: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  // Vercel Analytics 只接受 string|number|boolean，其余值丢弃
  const clean: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(props)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") clean[k] = v;
  }
  import("@vercel/analytics")
    .then(({ track }) => track(event, clean))
    .catch(() => {
      // 分析脚本不可用不影响主流程
    });
}

export function getAnonId(): string {
  if (anonId) return anonId;
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem("rf_anon_id");
    if (stored) {
      anonId = stored;
      return stored;
    }
    const generated =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      localStorage.setItem("rf_anon_id", generated);
    } catch {
      // 隐私模式等：仅内存使用
    }
    anonId = generated;
    return generated;
  }
  anonId = "anon-server";
  return anonId;
}

export function track(event: EventName, props: Record<string, unknown> = {}): void {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (!STRIPPED_KEYS.has(k)) clean[k] = v;
  }
  ring.push({ event, props: clean, anonId: getAnonId(), ts: Date.now() });
  if (ring.length > RING_SIZE) ring.shift();
  (dispatcher ?? defaultDispatcher)(event, clean);
  if (typeof console !== "undefined") console.debug("[riskfit]", event, clean);
}

export function getEvents(): TrackedEvent[] {
  return [...ring];
}

export function resetEvents(): void {
  ring = [];
}
