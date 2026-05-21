import type { NextFunction, Request, Response } from "express";
import { logger } from "../infra/logger/index.js";
import { checkRateLimit } from "../infra/rate-limit/limiter.js";

interface RateLimitConfig {
  windowSeconds: number;
  maxRequests: number;
}

type RateLimitKeyResolver = (req: Request) => string | undefined;

export function rateLimitMiddleware(
  scope: string,
  config: RateLimitConfig,
  resolveKey: RateLimitKeyResolver = (req) => req.ip
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const identity = resolveKey(req) ?? req.ip ?? "unknown";

    try {
      const result = await checkRateLimit(`${scope}:${identity}`, config);
      res.setHeader("X-RateLimit-Limit", String(config.maxRequests));
      res.setHeader("X-RateLimit-Remaining", String(result.remaining));

      if (!result.allowed) {
        res.setHeader("Retry-After", String(result.retryAfterSeconds));
        res.status(429).json({ error: "Muitas requisições. Tente novamente em instantes." });
        return;
      }
    } catch (error) {
      logger.warn({ error, scope }, "Rate limit unavailable; request allowed");
    }

    next();
  };
}
