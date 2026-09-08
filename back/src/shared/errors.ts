export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function notFound(): never {
  throw new AppError(404, "NOT_FOUND", "No encontramos este registro.");
}
