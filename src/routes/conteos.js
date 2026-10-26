import { Router } from "express";
import { Conteo, Item } from "../models.js";
import { authorize } from "../middleware/auth.js";
import { badRequest, conflict, notFound } from "../errors.js";
import { TIPOS, hoyISO, resumenConteo } from "../domain/kardex.js";
import { registrarMovimiento } from "../services/movimientos.js";
import { getConfig } from "../services/datos.js";

const MAX_LINEAS = 1500;

/** En un conteo a ciegas abierto el saldo del sistema no sale del servidor. */
function vista(c, costos) {
  const o = c.toJSON();
  const oculto = o.ciega && o.estado === "abierto";
  if (oculto) o.lineas = o.lineas.map(({ sistema, ...l }) => l);
  o.resumen = oculto ? { contadas: o.lineas.filter((l) => l.fisico != null).length, lineas: o.lineas.length } : resumenConteo(o, (id) => costos?.get(String(id)));
  return o;
}

async function costosDe(conteos) {
  const ids = [...new Set(conteos.flatMap((c) => c.lineas.map((l) => String(l.item))))];
  const items = await Item.find({ _id: { $in: ids } }, { costo: 1 }).lean();
  return new Map(items.map((i) => [String(i._id), i.costo || 0]));
}

async function cargar(id) {
  const c = await Conteo.findById(id).populate("por cerradoPor ajustePor", "nombre");
  if (!c) throw notFound("Conteo no encontrado");
  return c;
}

export default function conteosRoutes() {
  const r = Router();

  r.get("/", authorize("conteos:ver"), async (_req, res) => {
    const list = await Conteo.find().sort({ ts: -1 }).limit(200).populate("por", "nombre");
    const costos = await costosDe(list);
    res.json(list.map((c) => { const { lineas, ...o } = vista(c, costos); return o; }));
  });

  r.get("/:id", authorize("conteos:ver"), async (req, res) => {
    const c = await cargar(req.params.id);
    res.json(vista(c, await costosDe([c])));
  });

  r.post("/", authorize("conteos:crear"), async (req, res) => {
    const { fecha = hoyISO(), ubicacion = "", tipo = "", testigo = "", ciega = true } = req.body || {};
    if (tipo && !TIPOS[tipo]) throw badRequest("Tipo inválido");
    const f = { activo: true };
    if (ubicacion) f.ubicacion = ubicacion;
    if (tipo) f.tipo = tipo;
    const items = await Item.find(f).sort({ nombre: 1 });
    if (!items.length) throw badRequest("No hay ítems para esa ubicación y tipo");
    if (items.length > MAX_LINEAS) throw badRequest("Demasiados ítems para una sola planilla; filtre por ubicación o tipo");
    const c = await Conteo.create({
      fecha, ubicacion, tipo, testigo, ciega: Boolean(ciega), por: req.user._id,
      lineas: items.map((i) => ({ item: i._id, nombre: i.nombre, lote: i.lote, serie: i.serie, venc: i.vencimiento, sistema: i.saldo })),
    });
    res.status(201).json(vista(c));
  });

  // Guarda cantidades físicas y observaciones: [{ id, fisico, obs }]
  r.put("/:id/lineas", authorize("conteos:contar"), async (req, res) => {
    const c = await cargar(req.params.id);
    if (c.estado !== "abierto") throw conflict("El conteo está cerrado");
    const cambios = req.body?.lineas;
    if (!Array.isArray(cambios)) throw badRequest("Envíe las líneas a actualizar");
    for (const x of cambios) {
      const l = c.lineas.id(x.id);
      if (!l) throw badRequest(`Línea inexistente: ${x.id}`);
      if (x.fisico !== undefined) {
        if (x.fisico !== null && x.fisico !== "" && !(Number(x.fisico) >= 0)) throw badRequest("Las cantidades físicas deben ser mayores o iguales a cero");
        l.fisico = x.fisico === null || x.fisico === "" ? null : Number(x.fisico);
      }
      if (x.obs !== undefined) l.obs = String(x.obs);
    }
    await c.save();
    res.json(vista(c, await costosDe([c])));
  });

  r.post("/:id/cerrar", authorize("conteos:cerrar"), async (req, res) => {
    const c = await cargar(req.params.id);
    if (c.estado !== "abierto") throw conflict("El conteo ya está cerrado");
    const testigo = String(req.body?.testigo ?? c.testigo ?? "").trim();
    if (!testigo) throw badRequest("Registre el testigo del conteo");
    Object.assign(c, { estado: "cerrado", testigo, cerradoTs: new Date(), cerradoPor: req.user._id });
    await c.save();
    res.json(vista(await cargar(c._id), await costosDe([c])));
  });

  r.post("/:id/ajustar", authorize("conteos:ajustar"), async (req, res) => {
    const c = await cargar(req.params.id);
    if (c.estado !== "cerrado") throw conflict("Cierre el conteo antes de ajustar");
    if (c.ajustado) throw conflict("Los ajustes de este conteo ya fueron aplicados");
    const acta = String(req.body?.acta || "").trim(), motivo = String(req.body?.motivo || "").trim();
    if (!acta || !motivo) throw badRequest("Registre acta y motivo");
    const cfg = await getConfig();
    let aplicados = 0;
    const errores = [];
    for (const l of c.lineas.filter((x) => x.item && x.fisico != null && x.fisico !== x.sistema)) {
      const it = await Item.findById(l.item);
      if (!it) { errores.push(`${l.nombre}: ítem no encontrado`); continue; }
      // Se ajusta contra el saldo actual para no duplicar movimientos hechos después del conteo.
      const d = l.fisico - it.saldo;
      if (d === 0) continue;
      try {
        await registrarMovimiento({
          itemId: it._id, usuarioId: req.user._id, cfg, permitirVencido: true,
          data: { tipo: d > 0 ? "AJ_POS" : "AJ_NEG", cantidad: Math.abs(d), soporte: acta, motivo: motivo + (l.obs ? " · " + l.obs : ""), conteo: c._id },
        });
        aplicados++;
      } catch (e) { errores.push(`${l.nombre}: ${e.message}`); }
    }
    Object.assign(c, { ajustado: !errores.length, actaAjuste: acta, ajusteTs: new Date(), ajustePor: req.user._id });
    await c.save();
    res.json({ aplicados, errores, conteo: vista(await cargar(c._id), await costosDe([c])) });
  });

  return r;
}
