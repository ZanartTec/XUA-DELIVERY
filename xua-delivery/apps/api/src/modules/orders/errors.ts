import { AppError } from "../../errors/index.js";

export class OrderServiceError extends AppError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = "OrderServiceError";
  }
}
