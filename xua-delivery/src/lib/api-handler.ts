import { NextRequest, NextResponse } from "next/server";

const STATUS_MAP: Record<string, number> = {
  ORDER_NOT_FOUND: 404,
  SLOT_FULL: 409,
  SLOT_NOT_FOUND: 404,
  OTP_LOCKED: 423,
  OTP_EXPIRED: 410,
  OTP_NOT_FOUND: 404,
  INVALID_TRANSITION: 422,
  ACCESS_DENIED: 403,
};

type RouteContext = { params: Promise<{ id: string }> };

type HandlerFn =
  | ((req: NextRequest) => Promise<NextResponse>)
  | ((req: NextRequest, ctx: RouteContext) => Promise<NextResponse>);

export function withErrorHandling(handler: HandlerFn): HandlerFn {
  return async (req: NextRequest, ctx?: RouteContext) => {
    try {
      return await (handler as (req: NextRequest, ctx?: RouteContext) => Promise<NextResponse>)(req, ctx);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro interno";
      const status = STATUS_MAP[message] || 500;
      if (status === 500) {
        console.error("[API Error]", error);
      }
      return NextResponse.json({ error: message }, { status });
    }
  };
}
