export class OrderServiceError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "OrderServiceError";
  }
}
