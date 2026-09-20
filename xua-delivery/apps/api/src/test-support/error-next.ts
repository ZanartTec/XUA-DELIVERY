import type { NextFunction, Request, Response } from "express";
import { errorHandler } from "../middleware/error-handler.js";

/**
 * `next` para testes de controller que roda o errorHandler real.
 *
 * Os controllers não montam mais a resposta de erro — repassam tudo para
 * `next(err)`. Com este helper os testes continuam afirmando status e corpo
 * como antes e, de quebra, passam a exercitar a tradução central de
 * code → status em vez de um mapa duplicado dentro do controller.
 */
export function errorForwardingNext(req: Request, res: Response): NextFunction {
  return ((err?: unknown) => {
    if (err) errorHandler(err, req, res, () => {});
  }) as NextFunction;
}
