export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new ApiError(400, "BAD_REQUEST", message, details);
export const unauthorized = (message = "Se requiere iniciar sesión") =>
  new ApiError(401, "UNAUTHORIZED", message);
export const forbidden = (message = "No tiene permiso para esta acción") =>
  new ApiError(403, "FORBIDDEN", message);
export const notFound = (message = "No encontrado") => new ApiError(404, "NOT_FOUND", message);
export const conflict = (message: string, code = "CONFLICT") => new ApiError(409, code, message);
export const invalidTransition = (message: string) =>
  new ApiError(409, "INVALID_TRANSITION", message);
export const tooMany = (message = "Demasiadas solicitudes, intente más tarde") =>
  new ApiError(429, "RATE_LIMITED", message);
