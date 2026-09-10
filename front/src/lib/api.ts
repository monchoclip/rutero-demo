import { canQueueOfflineMutation, enqueueMutation } from "./offlineQueue";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4068";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export class OfflineQueuedError extends ApiError {
  constructor() {
    super(0, "Sin conexión: guardamos la actividad en este dispositivo y la sincronizaremos al volver a estar en línea.");
    this.name = "OfflineQueuedError";
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Ruts68-Request": "1",
        ...options.headers,
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    const method = (options.method ?? "GET").toUpperCase();
    if (
      typeof window !== "undefined" &&
      canQueueOfflineMutation(method, path)
    ) {
      await enqueueMutation(method as "POST" | "PATCH", path, options.body ? JSON.parse(String(options.body)) : null);
      throw new OfflineQueuedError();
    }
    throw new ApiError(
      0,
      "No pudimos conectar. Revisa tu conexión e intenta de nuevo.",
    );
  }
  const body = await response.json();
  if (!response.ok)
    throw new ApiError(
      response.status,
      body.message ?? "No pudimos completar la solicitud.",
    );
  return body.data as T;
}
export const post = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });
export const patch = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "PATCH", body: JSON.stringify(body) });
