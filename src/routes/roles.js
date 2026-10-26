import { Router } from "express";
import { Rol, Usuario } from "../models.js";
import { authorize } from "../middleware/auth.js";
import { badRequest, conflict, notFound } from "../errors.js";
import { normalizarPermisos } from "../permissions.js";

export default function rolesRoutes() {
  const r = Router();

  // Quien crea o edita usuarios necesita ver los roles para asignarlos.
  r.get("/", authorize("roles:ver", "usuarios:crear", "usuarios:editar"), async (_req, res) => {
    const [roles, conteo] = await Promise.all([
      Rol.find().sort({ sistema: -1, nombre: 1 }),
      Usuario.aggregate([{ $unwind: "$roles" }, { $group: { _id: "$roles", n: { $sum: 1 } } }]),
    ]);
    const n = new Map(conteo.map((c) => [String(c._id), c.n]));
    res.json(roles.map((x) => ({ ...x.toJSON(), usuarios: n.get(String(x._id)) || 0 })));
  });

  r.post("/", authorize("roles:crear"), async (req, res) => {
    const { nombre, descripcion = "", permisos = [] } = req.body || {};
    if (!nombre?.trim()) throw badRequest("El nombre del rol es obligatorio");
    if (await Rol.exists({ nombre: nombre.trim() })) throw conflict("Ya existe un rol con ese nombre");
    const rol = await Rol.create({ nombre, descripcion, permisos: normalizarPermisos(permisos) });
    res.status(201).json(rol);
  });

  r.put("/:id", authorize("roles:editar"), async (req, res) => {
    const rol = await Rol.findById(req.params.id);
    if (!rol) throw notFound("Rol no encontrado");
    const { nombre, descripcion, permisos } = req.body || {};
    if (rol.sistema && (permisos !== undefined || (nombre !== undefined && nombre !== rol.nombre))) {
      throw badRequest("El rol Administrador es del sistema: no se pueden cambiar su nombre ni sus permisos");
    }
    if (nombre !== undefined) {
      if (!nombre.trim()) throw badRequest("El nombre del rol es obligatorio");
      if (await Rol.exists({ nombre: nombre.trim(), _id: { $ne: rol._id } })) throw conflict("Ya existe un rol con ese nombre");
      rol.nombre = nombre;
    }
    if (descripcion !== undefined) rol.descripcion = descripcion;
    if (permisos !== undefined) rol.permisos = normalizarPermisos(permisos);
    await rol.save();
    res.json(rol);
  });

  r.delete("/:id", authorize("roles:eliminar"), async (req, res) => {
    const rol = await Rol.findById(req.params.id);
    if (!rol) throw notFound("Rol no encontrado");
    if (rol.sistema) throw badRequest("El rol Administrador no se puede eliminar");
    const n = await Usuario.countDocuments({ roles: rol._id });
    if (n) throw conflict(`El rol está asignado a ${n} usuario(s); reasígnelos antes de eliminarlo`);
    await rol.deleteOne();
    res.status(204).end();
  });

  return r;
}
