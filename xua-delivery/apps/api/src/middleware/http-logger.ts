import type { Request, Response, NextFunction } from "express";
import { createLogger } from "../infra/logger";

const log = createLogger("http");

export function httpLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const data = {
      method: req.method,
      url: req.originalUrl,
      status,
      duration: `${duration}ms`,
      userId: req.user?.sub,
    };

    if (status >= 500) {
      log.error(data, `${req.method} ${req.originalUrl} ${status}`);
    } else if (status >= 400) {
      log.warn(data, `${req.method} ${req.originalUrl} ${status}`);
    } else {
      log.info(data, `${req.method} ${req.originalUrl} ${status}`);
    }
  });

  next();
}
