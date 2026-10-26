import { Router } from "express";
import bcrypt from "bcryptjs";
import { Movimiento, Rol, Usuario } from "../models.js";
import { authorize } from "../middleware/auth.js";
import { badRequest, conflict, notFound } from "../errors.js";
import { MIN_CLAVE } from "./auth.js";

async function validarRoles(ids) {
  if (!Array.isArray(ids) || !ids.length) throw badRequest("Asigne al menos un rol");
  const roles = await Rol.find({ _id: { $in: ids } });
  if (roles.length !== new Set(ids.map(String)).size) throw badRequest("Uno o más roles no existen");
  return roles.map((r) => r._id);
}

/** Impide dejar el sistema sin ningún administrador activo cuando "u" deja de serlo. */
async function verificarQuedaAdmin(u, { activo, roles }) {
  const admin = await Rol.findOne({ sistema: true });
  if (!admin) return;
  const esAdmin = (rs, act) => act && rs.some((id) => String(id) === String(admin._id));
  if (!esAdmin(u.roles, u.activo) || esAdmin(roles, activo)) return;
  if (!(await Usuario.exists({ _id: { $ne: u._id }, activo: true, roles: admin._id }))) {
    throw conflict("Debe quedar al menos un usuario activo con el rol Administrador");
  }
}

const listar = (filtro) => Usuario.find(filtro).populate("roles", "nombre").sort({ nombre: 1 });

export default function usuariosRoutes() {
  const r = Router();

  r.get("/", authorize("usuarios:ver"), async (_req, res) => res.json(await listar({})));

  r.post("/", authorize("usuarios:crear"), async (req, res) => {
    const { username, nombre, email = "", password, roles, activo = true } = req.body || {};
    if (!username || !/^[a-z0-9._-]{3,40}$/i.test(username)) throw badRequest("El usuario debe tener 3 a 40 caracteres: letras, números, punto, guion");
    if (!nombre?.trim()) throw badRequest("El nombre es obligatorio");
    if (!password || String(password).length < MIN_CLAVE) throw badRequest(`La contraseña debe tener al menos ${MIN_CLAVE} caracteres`);
    if (await Usuario.exists({ username: username.toLowerCase() })) throw conflict("Ya existe un usuario con ese nombre de usuario");
    const u = await Usuario.create({
      username, nombre, email, activo: Boolean(activo),
      roles: await validarRoles(roles),
      passwordHash: await bcrypt.hash(String(password), req.app.locals.bcryptRounds),
    });
    res.status(201).json(await u.populate("roles", "nombre"));
  });

  r.put("/:id", authorize("usuarios:editar"), async (req, res) => {
    const u = await Usuario.findById(req.params.id);
    if (!u) throw notFound("Usuario no encontrado");
    const { nombre, email, roles, activo, password } = req.body || {};
    const propio = String(u._id) === String(req.user._id);
    if (propio && activo === false) throw badRequest("No puede inactivar su propio usuario");
    const nuevosRoles = roles !== undefined ? await validarRoles(roles) : u.roles;
    await verificarQuedaAdmin(u, { activo: activo !== undefined ? Boolean(activo) : u.activo, roles: nuevosRoles });
    if (nombre !== undefined) { if (!String(nombre).trim()) throw badRequest("El nombre es obligatorio"); u.nombre = nombre; }
    if (email !== undefined) u.email = email;
    if (activo !== undefined) u.activo = Boolean(activo);
    u.roles = nuevosRoles;
    if (password) {
      if (String(password).length < MIN_CLAVE) throw badRequest(`La contraseña debe tener al menos ${MIN_CLAVE} caracteres`);
      u.passwordHash = await bcrypt.hash(String(password), req.app.locals.bcryptRounds);
    }
    await u.save();
    res.json(await u.populate("roles", "nombre"));
  });

  r.delete("/:id", authorize("usuarios:eliminar"), async (req, res) => {
    const u = await Usuario.findById(req.params.id);
    if (!u) throw notFound("Usuario no encontrado");
    if (String(u._id) === String(req.user._id)) throw badRequest("No puede eliminar su propio usuario");
    if (await Movimiento.exists({ por: u._id })) throw conflict("El usuario tiene movimientos registrados; inactívelo en lugar de eliminarlo para conservar la trazabilidad");
    await verificarQuedaAdmin(u, { activo: false, roles: [] });
    await u.deleteOne();
    res.status(204).end();
  });

  return r;
}
