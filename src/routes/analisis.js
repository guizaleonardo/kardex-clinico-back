import { Router } from "express";
import { authorize } from "../middleware/auth.js";
import { TIPOS, computeAlerts, semaforo } from "../domain/kardex.js";
import { datosParaAnalisis } from "../services/datos.js";

const DIA = 86400000;

export function panelDesde({ items, movs, conteos, cfg }, alertas) {
  const act = items.filter((i) => i.activo !== false);
  const saldo = (i) => Math.max(0, Number(i.saldo) || 0);
  const costo = new Map(items.map((i) => [i.id, Number(i.costo) || 0]));
  const ult = conteos.find((c) => c.estado === "cerrado");
  let faltU = 0, faltV = 0;
  for (const l of ult?.lineas || []) {
    if (l.fisico == null) continue;
    const d = l.sistema - l.fisico;
    if (d > 0) { faltU += d; faltV += d * (costo.get(l.item) || 0); }
  }
  const porTipo = Object.keys(TIPOS).map((t) => {
    const l = act.filter((i) => i.tipo === t);
    const c = { verde: 0, amarillo: 0, rojo: 0, vencido: 0, sin: 0 };
    l.forEach((i) => c[semaforo(i, cfg)]++);
    return { tipo: t, n: l.length, semaforo: c };
  }).filter((x) => x.n);
  return {
    kpis: {
      referencias: act.length,
      unidades: act.reduce((s, i) => s + saldo(i), 0),
      valor: act.reduce((s, i) => s + saldo(i) * (Number(i.costo) || 0), 0),
      vencidosConSaldo: act.filter((i) => semaforo(i, cfg) === "vencido" && i.saldo > 0).length,
      rojoConSaldo: act.filter((i) => semaforo(i, cfg) === "rojo" && i.saldo > 0).length,
      faltanteUltimaToma: faltU,
      valorFaltanteUltimaToma: faltV,
      fechaUltimaToma: ult?.fecha || null,
      alertasCriticas: alertas.filter((a) => a.nivel === "critico").length,
      alertas: alertas.length,
    },
    porTipo,
    alertas: alertas.slice(0, 8),
    ultimosMovimientos: movs.slice(0, 6),
  };
}

export function riesgoDesde({ items, movs, conteos }, ahora = Date.now()) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const fx = {};
  for (const c of conteos) for (const l of c.lineas || []) {
    if (l.fisico == null || !l.item) continue;
    const d = l.sistema - l.fisico;
    if (d > 0) { const o = (fx[l.item] ||= { n: 0, unidades: 0 }); o.n++; o.unidades += d; }
  }
  const faltantes = Object.entries(fx).map(([id, o]) => ({ item: byId.get(id), ...o })).filter((x) => x.item)
    .map((x) => ({ itemId: x.item.id, nombre: x.item.nombre, lote: x.item.lote, tomas: x.n, unidades: x.unidades, valor: x.unidades * (x.item.costo || 0) }))
    .sort((a, b) => b.valor - a.valor || b.unidades - a.unidades).slice(0, 10);
  const ajU = {};
  for (const m of movs) if (m.ts > ahora - 90 * DIA && (m.tipo === "AJ_NEG" || m.tipo === "BAJA")) {
    const o = (ajU[m.por] ||= { usuario: m.porNombre, registros: 0, unidades: 0, valor: 0 });
    o.registros++; o.unidades += m.cantidad; o.valor += m.cantidad * (m.costo || 0);
  }
  return { faltantes, ajustesPorUsuario: Object.values(ajU).sort((a, b) => b.unidades - a.unidades) };
}

export default function analisisRoutes() {
  const r = Router();
  r.get("/panel", authorize("panel:ver"), async (_req, res) => {
    const d = await datosParaAnalisis();
    res.json(panelDesde(d, computeAlerts(d)));
  });
  r.get("/analisis", authorize("analisis:ver"), async (_req, res) => {
    const d = await datosParaAnalisis();
    res.json({ alertas: computeAlerts(d), ...riesgoDesde(d) });
  });
  return r;
}
