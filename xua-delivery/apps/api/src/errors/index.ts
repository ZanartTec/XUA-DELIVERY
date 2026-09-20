/**
 * Erros de aplicação — fonte única da tradução `code de domínio` → status HTTP.
 *
 * Antes disso cada controller tinha seu próprio mapa (orders, payments, zones e
 * user-subscriptions tinham quatro mapas paralelos) e repetia `instanceof` para
 * decidir o status, o que fazia o formato da resposta divergir entre módulos e
 * obrigava a registrar cada code novo em vários lugares.
 *
 * Agora os erros de domínio estendem AppError, os controllers só fazem
 * `next(err)` e o middleware errorHandler formata a resposta.
 */

/**
 * code → status HTTP. Um code ausente aqui vira 400 (ou o defaultStatus da
 * classe), que é o comportamento que os mapas antigos já tinham.
 */
export const ERROR_STATUS: Record<string, number> = {
  // ── Genéricos ─────────────────────────────────────────────────
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_ERROR: 400,
  INTERNAL_ERROR: 500,

  // ── Pedidos ───────────────────────────────────────────────────
  ORDER_NOT_FOUND: 404,
  INVALID_TRANSITION: 400,
  INVALID_STATUS: 400,
  ALREADY_RATED: 409,
  STOCK_UNAVAILABLE: 409,
  IDEMPOTENCY_CONFLICT: 409,
  INVALID_CASH_CHANGE: 400,
  CASH_PAYMENT_INVALID: 409,
  PAYMENT_METHOD_NOT_ALLOWED: 400,

  // ── Inventário / vasilhames ───────────────────────────────────
  INVENTORY_ITEM_NOT_FOUND: 400,
  INVENTORY_ITEM_INACTIVE: 400,
  INVENTORY_ITEM_CONFLICT: 409,
  OPEN_SESSION_EXISTS: 409,

  // ── Caução ────────────────────────────────────────────────────
  CONSUMER_NOT_FOUND: 404,
  PROGRAM_NOT_FOUND: 404,

  // ── OTP ───────────────────────────────────────────────────────
  OTP_NOT_FOUND: 404,
  OTP_EXPIRED: 400,
  OTP_LOCKED: 429,

  // ── Pagamentos ────────────────────────────────────────────────
  INVALID_ORDER_STATUS: 409,
  PROVIDER_REDIRECT_MISSING: 502,
  PAYMENT_METHOD_REQUIRED: 400,
  GATEWAY_REQUIRED: 400,

  // ── Distribuidora / agenda ────────────────────────────────────
  DISTRIBUTOR_NOT_LINKED: 403,
  DISTRIBUTOR_NOT_FOUND: 404,
  DISTRIBUTOR_INACTIVE: 409,
  DISTRIBUTOR_GATEWAY_REQUIRED: 400,
  TIME_SLOT_UNAVAILABLE: 400,
  DATE_UNAVAILABLE: 422,

  // ── Zonas ─────────────────────────────────────────────────────
  ZONE_NOT_FOUND: 404,
  DUPLICATE_ZONE_NAME: 409,
  COVERAGE_CONFLICT: 409,
  ZONE_HAS_OPEN_ORDERS: 409,
  SAME_DISTRIBUTOR: 400,

  // ── Assinaturas ───────────────────────────────────────────────
  PLAN_NOT_FOUND: 404,
  SUBSCRIPTION_NOT_FOUND: 404,
  ADDRESS_NOT_FOUND: 404,
  ADDRESS_WITHOUT_ZONE: 400,
  DISTRIBUTOR_NOT_COVERING_ZONE: 400,
  DELIVERY_DATE_NOT_FOUND: 404,
  NOT_EDITABLE: 409,
};

export interface AppErrorOptions {
  /** Força um status específico, ignorando o registry. */
  status?: number;
  /** Status usado quando o code não está no registry. Default: 400. */
  defaultStatus?: number;
  /** Payload extra devolvido ao cliente (ex.: conflitos de cobertura de zona). */
  details?: unknown;
}

/**
 * Erro de domínio traduzível para HTTP. Serviços lançam subclasses disso;
 * controllers apenas repassam para `next(err)`.
 */
export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, message: string, options: AppErrorOptions = {}) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = options.status ?? ERROR_STATUS[code] ?? options.defaultStatus ?? 400;
    this.details = options.details;
  }
}

// ── Atalhos para erros genéricos em controllers e guards ──────────
export const badRequest = (message: string, options?: AppErrorOptions): AppError =>
  new AppError("BAD_REQUEST", message, options);

export const unauthorized = (message = "Não autenticado", options?: AppErrorOptions): AppError =>
  new AppError("UNAUTHORIZED", message, options);

export const forbidden = (message = "Acesso negado", options?: AppErrorOptions): AppError =>
  new AppError("FORBIDDEN", message, options);

export const notFound = (message: string, options?: AppErrorOptions): AppError =>
  new AppError("NOT_FOUND", message, options);

export const conflict = (message: string, options?: AppErrorOptions): AppError =>
  new AppError("CONFLICT", message, options);
