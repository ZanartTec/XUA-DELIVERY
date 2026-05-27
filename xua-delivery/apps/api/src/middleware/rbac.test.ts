import { describe, expect, it, vi } from "vitest";
import { requireRole } from "./rbac.js";

function responseMock() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

describe("requireRole", () => {
  it("nega usuario sem role exigida para carga inicial", () => {
    const req = {
      user: { sub: "user-1", role: "support" },
      originalUrl: "/api/distributor/inventory/initial-load",
    };
    const res = responseMock();
    const next = vi.fn();

    requireRole("distributor_admin")(req as never, res as never, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Acesso negado" });
    expect(next).not.toHaveBeenCalled();
  });

  it("permite distributor_admin na carga inicial", () => {
    const req = {
      user: { sub: "user-1", role: "distributor_admin" },
      originalUrl: "/api/distributor/inventory/initial-load",
    };
    const res = responseMock();
    const next = vi.fn();

    requireRole("distributor_admin")(req as never, res as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});