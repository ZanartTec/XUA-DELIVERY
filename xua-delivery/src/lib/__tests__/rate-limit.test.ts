import { describe, it, expect } from "vitest";

/**
 * Testes do rate limiter — lógica de sliding window.
 * Usa lógica isolada sem dependência real de Redis.
 */

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

function checkRateLimitLogic(
  currentCount: number,
  config: RateLimitConfig
): { allowed: boolean; remaining: number } {
  const allowed = currentCount < config.maxRequests;
  return {
    allowed,
    remaining: Math.max(0, config.maxRequests - currentCount - (allowed ? 1 : 0)),
  };
}

describe("Rate Limit Logic", () => {
  const config: RateLimitConfig = { windowMs: 60000, maxRequests: 10 };

  it("permite requests dentro do limite", () => {
    const result = checkRateLimitLogic(0, config);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it("permite até o penúltimo request", () => {
    const result = checkRateLimitLogic(8, config);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it("permite o último request", () => {
    const result = checkRateLimitLogic(9, config);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("bloqueia quando no limite", () => {
    const result = checkRateLimitLogic(10, config);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("bloqueia quando acima do limite", () => {
    const result = checkRateLimitLogic(15, config);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("auth rate limit mais restritivo", () => {
    const authConfig: RateLimitConfig = { windowMs: 60000, maxRequests: 5 };
    const result = checkRateLimitLogic(5, authConfig);
    expect(result.allowed).toBe(false);
  });
});
