import jwt from "jsonwebtoken";
import { Usuario } from "../models.js";
import { forbidden, unauthorized } from "../errors.js";
import { tienePermiso } from "../permissions.js";

export function permisosDe(usuario) {
  const set = new Set();
  for (const r of usuario.roles || []) for (const p of r.permisos || []) set.add(p);
  return set;
}

/** Valida el JWT y carga el usuario con sus permisos vigentes (los cambios de rol aplican de inmediato). */
export async function authenticate(req, _res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) throw unauthorized();
  let payload;
  try {
    payload = jwt.verify(token, req.app.locals.jwtSecret);
  } catch {
    throw unauthorized("Sesión inválida o vencida");
  }
  const usuario = await Usuario.findById(payload.sub).populate("roles");
  if (!usuario || !usuario.activo) throw unauthorized("Usuario inexistente o inactivo");
  req.user = usuario;
  req.permisos = permisosDe(usuario);
  next();
}

/** Exige al menos uno de los permisos "pantalla:accion" indicados. */
export const authorize = (...permisos) => (req, _res, next) => {
  if (!tienePermiso(req.permisos, ...permisos)) throw forbidden();
  next();
};
