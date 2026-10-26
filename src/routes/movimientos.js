import { Router } from "express";
import { Movimiento } from "../models.js";
import { authorize } from "../middleware/auth.js";
import { badRequest } from "../errors.js";
import { registrarMovimiento } from "../services/movimientos.js";
import { getConfig } from "../services/datos.js";

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export default function movimientosRoutes() {
  const r = Router();

  // Los movimientos no se editan ni eliminan: un error se corrige con un ajuste soportado.
  r.get("/", authorize("movimientos:ver", "panel:ver"), async (req, res) => {
    const { tipo, q, desde, hasta, item } = req.query;
    const limit = Math.min(Number(req.query.limit) || 300, 1000);
    const f = {};
    if (tipo) f.tipo = tipo;
    if (item) f.item = item;
    if (desde || hasta) {
      f.ts = {};
      if (desde) f.ts.$gte = new Date(desde + "T00:00:00");
      if (hasta) f.ts.$lte = new Date(hasta + "T23:59:59.999");
    }
    if (q) {
      const re = new RegExp(escRe(String(q)), "i");
      f.$or = ["itemNombre", "lote", "serie", "soporte", "paciente", "destino"].map((k) => ({ [k]: re }));
    }
    res.json(await Movimiento.find(f).sort({ ts: -1 }).limit(limit).populate("por", "nombre"));
  });

  r.post("/", authorize("movimientos:crear"), async (req, res) => {
    const { item, ...data } = req.body || {};
    if (!item) throw badRequest("Seleccione un producto");
    const mov = await registrarMovimiento({ itemId: item, data, usuarioId: req.user._id, cfg: await getConfig() });
    res.status(201).json(mov);
  });

  return r;
}
