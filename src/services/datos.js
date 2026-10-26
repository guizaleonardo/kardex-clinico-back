import { Config, Conteo, Item, Movimiento, Usuario } from "../models.js";
import { DEF_CFG } from "../domain/kardex.js";

export async function getConfig() {
  const c = await Config.findById("main").lean();
  if (!c) return { ...DEF_CFG };
  const { _id, __v, por, actualizado, ...rest } = c;
  const cfg = { ...DEF_CFG };
  for (const [k, v] of Object.entries(rest)) if (v !== null && v !== undefined) cfg[k] = v;
  if (!Array.isArray(cfg.servicios) || !cfg.servicios.length) cfg.servicios = DEF_CFG.servicios;
  return cfg;
}

export async function nombresUsuarios() {
  const us = await Usuario.find({}, { nombre: 1 }).lean();
  return new Map(us.map((u) => [String(u._id), u.nombre]));
}

const plano = (d) => ({ ...d, id: String(d._id), _id: undefined, __v: undefined });

/** Datos en forma plana (ids como texto, fechas en ms) para las reglas de dominio. */
export async function datosParaAnalisis() {
  const [items, movs, conteos, nombres, cfg] = await Promise.all([
    Item.find().lean(),
    Movimiento.find().sort({ ts: -1 }).limit(1000).lean(),
    Conteo.find({ estado: "cerrado" }).sort({ ts: -1 }).limit(200).lean(),
    nombresUsuarios(),
    getConfig(),
  ]);
  return {
    cfg,
    nombres,
    items: items.map((i) => ({ ...plano(i), creado: i.creado ? new Date(i.creado).getTime() : 0 })),
    movs: movs.map((m) => ({ ...plano(m), item: String(m.item), por: String(m.por), porNombre: nombres.get(String(m.por)) || "", ts: new Date(m.ts).getTime() })),
    conteos: conteos.map((c) => ({ ...plano(c), ts: new Date(c.ts).getTime(), lineas: (c.lineas || []).map((l) => ({ ...l, item: l.item ? String(l.item) : null })) })),
  };
}
