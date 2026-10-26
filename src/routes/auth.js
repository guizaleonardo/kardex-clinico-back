import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Usuario } from "../models.js";
import { authenticate, permisosDe } from "../middleware/auth.js";
import { badRequest, unauthorized } from "../errors.js";
import { ACCIONES, PANTALLAS, TODOS_LOS_PERMISOS } from "../permissions.js";

export const MIN_CLAVE = 8;

export function sesion(usuario) {
  const permisos = permisosDe(usuario);
  return {
    usuario: {
      id: String(usuario._id),
      username: usuario.username,
      nombre: usuario.nombre,
      email: usuario.email,
      roles: (usuario.roles || []).map((r) => ({ id: String(r._id), nombre: r.nombre })),
    },
    permisos: TODOS_LOS_PERMISOS.filter((p) => permisos.has(p)),
  };
}

export default function authRoutes() {
  const r = Router();

  r.post("/login", async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) throw badRequest("Ingrese usuario y contraseña");
    const u = await Usuario.findOne({ username: String(username).toLowerCase().trim() }).populate("roles");
    // Mismo mensaje para usuario inexistente o clave errada: no revela qué usuarios existen.
    if (!u || !u.activo || !(await bcrypt.compare(String(password), u.passwordHash))) throw unauthorized("Usuario o contraseña incorrectos");
    u.ultimoIngreso = new Date();
    await u.save();
    const { jwtSecret, jwtExpires } = req.app.locals;
    const token = jwt.sign({ sub: String(u._id) }, jwtSecret, { expiresIn: jwtExpires });
    res.json({ token, ...sesion(u) });
  });

  r.get("/me", authenticate, (req, res) => res.json(sesion(req.user)));

  r.post("/cambiar-clave", authenticate, async (req, res) => {
    const { actual, nueva } = req.body || {};
    if (!(await bcrypt.compare(String(actual || ""), req.user.passwordHash))) throw badRequest("La contraseña actual no es correcta");
    if (!nueva || String(nueva).length < MIN_CLAVE) throw badRequest(`La nueva contraseña debe tener al menos ${MIN_CLAVE} caracteres`);
    req.user.passwordHash = await bcrypt.hash(String(nueva), req.app.locals.bcryptRounds);
    await req.user.save();
    res.json({ ok: true });
  });

  r.get("/catalogo", authenticate, (_req, res) => res.json({ pantallas: PANTALLAS, acciones: ACCIONES }));

  return r;
}
