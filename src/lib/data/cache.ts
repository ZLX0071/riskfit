// 进程内 TTL 缓存（serverless 冷启动靠快照兜底，spec §7）。

export class TTLCache {
  private store = new Map<string, { value: unknown; expires: number }>();

  constructor(
    private ttlMs: number,
    private now: () => number = () => Date.now(),
  ) {}

  get(key: string): unknown {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (this.now() >= hit.expires) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: unknown): void {
    this.store.set(key, { value, expires: this.now() + this.ttlMs });
  }
}
