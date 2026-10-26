import { Router } from "express";
import { Config } from "../models.js";
import { authorize } from "../middleware/auth.js";
import { badRequest } from "../errors.js";
import { getConfig } from "../services/datos.js";

export function validarConfig(b = {}) {
  const n = {
    servicios: (Array.isArray(b.servicios) ? b.servicios : String(b.servicios || "").split("\n")).map((s) => String(s).trim()).filter(Boolean),
    rojoMeses: Number(b.rojoMeses),
    amarilloMeses: Number(b.amarilloMeses),
    diasConsignacion: Number(b.diasConsignacion),
    horaInicio: Number(b.horaInicio),
    horaFin: Number(b.horaFin),
  };
  const e = [];
  if (!n.servicios.length) e.push("Registre al menos un servicio o ubicación");
  if (!(n.rojoMeses >= 1)) e.push("El umbral rojo debe ser al menos 1 mes");
  if (!(n.amarilloMeses > n.rojoMeses)) e.push("El umbral amarillo debe ser mayor que el rojo");
  if (!(n.diasConsignacion >= 1)) e.push("Los días de consignación deben ser al menos 1");
  if (!(n.horaInicio >= 0 && n.horaInicio <= 23)) e.push("La hora de inicio debe estar entre 0 y 23");
  if (!(n.horaFin > n.horaInicio && n.horaFin <= 24)) e.push("La hora de fin debe ser mayor que la de inicio y máximo 24");
  if (e.length) throw badRequest(e.join(". "));
  return n;
}

export default function configRoutes() {
  const r = Router();
  // Todos los usuarios autenticados leen la configuración (servicios, umbrales del semáforo).
  r.get("/", async (_req, res) => res.json(await getConfig()));
  r.put("/", authorize("ajustes:editar"), async (req, res) => {
    const n = validarConfig(req.body);
    await Config.findByIdAndUpdate("main", { ...n, por: req.user._id }, { upsert: true });
    res.json(await getConfig());
  });
  return r;
}
