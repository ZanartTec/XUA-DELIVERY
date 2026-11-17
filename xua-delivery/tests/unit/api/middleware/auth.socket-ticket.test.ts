import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O passe do socket (`typ: "socket"`) só abre o handshake do tempo real:
 * enviado como cookie numa rota HTTP, ele não vale como sessão.
 */

process.env.JWT_SECRET = "unit-test-jwt-secret-with-32-chars-minimum";

vi.mock("@api/infra/auth/blacklist", () => ({ isBlacklisted: async () => false }));
vi.mock("@api/infra/auth/password-change", () => ({ isTokenStale: async () => false }));
vi.mock("@api/infra/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { signToken, signSocketTicket, verifyToken } = await import("@api/infra/auth/jwt");
const { authMiddleware, optionalAuthMiddleware } = await import("@api/middleware/auth");

function response() {
  const res = { statusCode: 200, body: undefined as unknown, status: vi.fn(), json: vi.fn() };
  res.status.mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json.mockImplementation((body: unknown) => {
    res.body = body;
    return res;
  });
  return res;
}

let session: string;
let ticket: string;

beforeEach(async () => {
  session = await signToken({ sub: "user-1", role: "consumer", name: "Ana" });
  ({ ticket } = await signSocketTicket(await verifyToken(session)));
});

describe("authMiddleware × passe do socket", () => {
  it("sessão normal passa", async () => {
    const req = { cookies: { "xua-token": session } } as never as { user?: unknown };
    const next = vi.fn();
    await authMiddleware(req as never, response() as never, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toMatchObject({ sub: "user-1" });
  });

  it("passe usado como cookie de sessão → 401", async () => {
    const res = response();
    const next = vi.fn();
    await authMiddleware({ cookies: { "xua-token": ticket } } as never, res as never, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("rota opcional ignora o passe (segue sem usuário)", async () => {
    const req = { cookies: { "xua-token": ticket } } as { user?: unknown };
    const next = vi.fn();
    await optionalAuthMiddleware(req as never, response() as never, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toBeUndefined();
  });
});
