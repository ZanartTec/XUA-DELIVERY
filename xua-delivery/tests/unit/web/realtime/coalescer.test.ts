import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createKeyCoalescer } from "@/src/realtime/coalescer";

/** U10 — rajada de eventos vira um lote de invalidação. */
describe("createKeyCoalescer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("50 eventos em 100 ms → 1 lote com chaves deduplicadas", () => {
    const flush = vi.fn();
    const coalescer = createKeyCoalescer(flush, 300);

    for (let i = 0; i < 50; i++) {
      coalescer.add([["distributor-queue"], ["kpis"], ["order", `o-${i % 5}`]]);
      vi.advanceTimersByTime(2);
    }
    expect(flush).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(flush).toHaveBeenCalledTimes(1);
    const keys = flush.mock.calls[0][0];
    expect(keys).toHaveLength(2 + 5);
    expect(keys).toEqual(expect.arrayContaining([["distributor-queue"], ["kpis"], ["order", "o-0"]]));
  });

  it("a janela não se estende: atraso máximo é o delay", () => {
    const flush = vi.fn();
    const coalescer = createKeyCoalescer(flush, 300);
    coalescer.add([["a"]]);
    vi.advanceTimersByTime(250);
    coalescer.add([["b"]]);
    vi.advanceTimersByTime(50);
    expect(flush).toHaveBeenCalledWith([["a"], ["b"]]);
  });

  it("depois de um lote, um novo evento abre outra janela", () => {
    const flush = vi.fn();
    const coalescer = createKeyCoalescer(flush, 300);
    coalescer.add([["a"]]);
    vi.advanceTimersByTime(300);
    coalescer.add([["a"]]);
    vi.advanceTimersByTime(300);
    expect(flush).toHaveBeenCalledTimes(2);
  });

  it("lista vazia não agenda nada; dispose descarta o pendente", () => {
    const flush = vi.fn();
    const coalescer = createKeyCoalescer(flush, 300);
    coalescer.add([]);
    coalescer.add([["a"]]);
    coalescer.dispose();
    vi.advanceTimersByTime(1000);
    expect(flush).not.toHaveBeenCalled();
  });
});
