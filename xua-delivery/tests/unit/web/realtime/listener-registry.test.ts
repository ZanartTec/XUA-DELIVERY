import { describe, expect, it, vi } from "vitest";
import { createListenerRegistry } from "@/src/realtime/listener-registry";

/** U11 — ouvintes independentes do socket (regressão do F2). */
describe("createListenerRegistry", () => {
  it("handler registrado ANTES de existir socket recebe os eventos que chegam depois", () => {
    const registry = createListenerRegistry();
    const handler = vi.fn();
    registry.on("new_order", handler);

    // "socket conecta" só depois e repassa o evento
    registry.emit("new_order", { orderId: "o-1", status: "SENT_TO_DISTRIBUTOR" } as never);

    expect(handler).toHaveBeenCalledWith({ orderId: "o-1", status: "SENT_TO_DISTRIBUTOR" });
  });

  it("só entrega o evento a quem ouve aquele evento", () => {
    const registry = createListenerRegistry();
    const onNew = vi.fn();
    const onStatus = vi.fn();
    registry.on("new_order", onNew);
    registry.on("order_status_changed", onStatus);
    registry.emit("order_status_changed", { orderId: "o-1", status: "CANCELLED" } as never);
    expect(onNew).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledTimes(1);
  });

  it("off (função devolvida) remove o handler", () => {
    const registry = createListenerRegistry();
    const handler = vi.fn();
    const off = registry.on("otp_generated", handler);
    off();
    registry.emit("otp_generated", { orderId: "o-1", code: "1234" });
    expect(handler).not.toHaveBeenCalled();
    expect(registry.count("otp_generated")).toBe(0);
  });

  it("handler com erro não derruba os outros e é reportado", () => {
    const onError = vi.fn();
    const registry = createListenerRegistry(onError);
    const ok = vi.fn();
    registry.on("new_order", () => {
      throw new Error("boom");
    });
    registry.on("new_order", ok);
    registry.emit("new_order", { orderId: "o-1", status: "SENT_TO_DISTRIBUTOR" } as never);
    expect(ok).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("new_order", expect.any(Error));
  });

  it("handler que se remove durante o disparo não faz pular o próximo", () => {
    const registry = createListenerRegistry();
    const second = vi.fn();
    const off = registry.on("new_order", () => off());
    registry.on("new_order", second);
    registry.emit("new_order", { orderId: "o-1", status: "SENT_TO_DISTRIBUTOR" } as never);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
