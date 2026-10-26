export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new HttpError(400, msg, details);
export const notFound = (msg = "Recurso no encontrado") => new HttpError(404, msg);
export const forbidden = (msg = "No tiene permiso para esta acción") => new HttpError(403, msg);
export const unauthorized = (msg = "Debe iniciar sesión") => new HttpError(401, msg);
export const conflict = (msg) => new HttpError(409, msg);

export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
  }
  if (err?.name === "CastError") return res.status(400).json({ error: "Identificador inválido" });
  if (err?.name === "ValidationError") return res.status(400).json({ error: Object.values(err.errors).map((e) => e.message).join(". ") });
  if (err?.code === 11000) return res.status(409).json({ error: "Ya existe un registro con ese valor único" });
  if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "JSON inválido" });
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor" });
}
