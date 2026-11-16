import { describe, expect, it } from "vitest";
import { OPS_BROADCAST_ROOM, rooms } from "@api/infra/realtime/rooms";

// Os nomes são contrato com clientes já conectados durante um deploy: mudar
// qualquer um deles faz eventos sumirem sem erro.
describe("rooms", () => {
  it("mantém os nomes de sala estáveis", () => {
    expect(rooms.consumer("c1")).toBe("consumer:c1");
    expect(rooms.driver("d1")).toBe("driver:d1");
    expect(rooms.distributor("x1")).toBe("distributor:x1");
    expect(rooms.user("distributor_admin", "u1")).toBe("distributor_admin:u1");
    expect(rooms.ops()).toBe("ops:broadcast");
    expect(OPS_BROADCAST_ROOM).toBe("ops:broadcast");
  });
});
