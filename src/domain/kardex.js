/* Reglas de negocio puras del kardex (sin acceso a datos). */

export const TIPOS = { MED: "Medicamento", DM: "Dispositivo médico", INS: "Insumo", OST: "Osteosíntesis / implante" };

export const MOV = {
  ENT: { l: "Entrada (compra / remisión)", s: 1 },
  DEV_IN: { l: "Devolución desde servicio", s: 1 },
  AJ_POS: { l: "Ajuste positivo (acta)", s: 1 },
  SAL: { l: "Salida / dispensación a servicio", s: -1 },
  USO: { l: "Uso en paciente / implantado", s: -1 },
  DEV_PROV: { l: "Devolución a proveedor / casa comercial", s: -1 },
  BAJA: { l: "Baja (vencido, averiado, alerta sanitaria)", s: -1 },
  AJ_NEG: { l: "Ajuste negativo (acta)", s: -1 },
};

export const RIESGOS = ["", "I", "IIa", "IIb", "III"];

export const DEF_CFG = {
  servicios: ["Servicio farmacéutico", "Urgencias", "Hospitalización", "UCI", "UCI intermedia", "Cirugía", "Central de esterilización", "Ambulancia", "Laboratorio", "Imágenes diagnósticas"],
  rojoMeses: 6,
  amarilloMeses: 12,
  diasConsignacion: 30,
  horaInicio: 6,
  horaFin: 22,
};

export const ITEM_TEXTO = ["tipo", "codigo", "nombre", "presentacion", "invima", "lote", "serie", "referencia", "fabricante", "proveedor", "vencimiento", "ubicacion", "riesgo"];
export const ITEM_NUM = ["costo", "stockMin"];
export const ITEM_BOOL = ["cadenaFrio", "controlEspecial", "consignacion"];

export const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
export const hoyISO = (d = new Date()) => d.toISOString().slice(0, 10);
const DIA = 86400000;

export function itemKey(o) {
  return [norm(o.codigo) || norm(o.nombre), norm(o.lote), norm(o.serie), norm(o.ubicacion)].join("|");
}

/** Limpia y valida los campos editables de un ítem. Devuelve { item, errores }. */
export function limpiarItem(body = {}, { parcial = false } = {}) {
  const item = {};
  const errores = [];
  for (const k of ITEM_TEXTO) if (k in body) item[k] = String(body[k] ?? "").trim();
  for (const k of ITEM_NUM) if (k in body) {
    const v = body[k];
    if (v === null || v === "" || v === undefined) item[k] = null;
    else if (!Number.isFinite(Number(v)) || Number(v) < 0) errores.push(`${k} debe ser un número mayor o igual a cero`);
    else item[k] = Number(v);
  }
  for (const k of ITEM_BOOL) if (k in body) item[k] = Boolean(body[k]);
  if (!parcial || "nombre" in item) if (!item.nombre) errores.push("El nombre es obligatorio");
  if (!parcial && !item.tipo) item.tipo = "MED";
  if (item.tipo !== undefined && !TIPOS[item.tipo]) errores.push("Tipo de ítem inválido");
  if (item.riesgo !== undefined && !RIESGOS.includes(item.riesgo)) errores.push("Clasificación de riesgo inválida");
  if (item.vencimiento && !/^\d{4}-\d{2}-\d{2}$/.test(item.vencimiento)) errores.push("La fecha de vencimiento debe tener formato AAAA-MM-DD");
  return { item, errores };
}

export function semaforo(it, cfg = DEF_CFG, hoy = hoyISO()) {
  if (!it?.vencimiento) return "sin";
  const d = (new Date(it.vencimiento + "T00:00:00Z") - new Date(hoy + "T00:00:00Z")) / DIA;
  if (d < 0) return "vencido";
  if (d < cfg.rojoMeses * 30.44) return "rojo";
  if (d < cfg.amarilloMeses * 30.44) return "amarillo";
  return "verde";
}

/** Reglas de soporte documental y saldo para un movimiento. Devuelve el mensaje de error o null. */
export function validarMovimiento(it, d, { cfg = DEF_CFG, hoy = hoyISO(), permitirVencido = false } = {}) {
  if (!it) return "Seleccione un producto";
  if (it.activo === false) return "El ítem está inactivo";
  if (!MOV[d.tipo]) return "Tipo de movimiento inválido";
  const q = Number(d.cantidad);
  if (!(q > 0)) return "Ingrese una cantidad mayor que cero";
  if ((d.tipo === "ENT" || d.tipo === "DEV_PROV") && !d.soporte) return "Registre el documento soporte";
  if (d.tipo === "SAL" && !d.destino) return "Seleccione el servicio destino";
  if (d.tipo === "USO" && it.tipo === "OST" && !d.paciente) return "Para implantes registre la historia clínica del paciente";
  if (["AJ_NEG", "AJ_POS", "BAJA"].includes(d.tipo) && (!d.soporte || !d.motivo)) return "Los ajustes y bajas requieren acta soporte y motivo";
  const saldo = Number(it.saldo) || 0;
  if (MOV[d.tipo].s < 0 && q > saldo) return `La cantidad supera el saldo disponible (${saldo})`;
  if (!permitirVencido && MOV[d.tipo].s < 0 && d.tipo !== "BAJA" && semaforo(it, cfg, hoy) === "vencido") return "El lote está vencido: solo se permite Baja";
  return null;
}

/** Diferencias de un conteo cerrado: faltante/sobrante en unidades y valor. */
export function resumenConteo(conteo, costoDe = () => 0) {
  let faltante = 0, sobrante = 0, valorFaltante = 0, contadas = 0;
  for (const l of conteo.lineas || []) {
    if (l.fisico === null || l.fisico === undefined) continue;
    contadas++;
    const d = Number(l.fisico) - Number(l.sistema);
    if (d < 0) { faltante -= d; valorFaltante += -d * (Number(costoDe(l.item)) || 0); }
    else sobrante += d;
  }
  return { faltante, sobrante, valorFaltante, contadas, lineas: (conteo.lineas || []).length };
}

const label = (it) => it ? `${it.nombre}${it.presentacion ? " · " + it.presentacion : ""} — Lote ${it.lote || "s/l"}${it.serie ? " · Serie " + it.serie : ""} · ${it.ubicacion || ""}` : "(ítem eliminado)";

/**
 * Alertas deterministas de riesgo de pérdida y cumplimiento normativo.
 * items: con id, saldo, etc. movs: con item (id), itemTipo, itemNombre, lote, serie, por, porNombre, ts (ms).
 * conteos: con estado, ts, fecha, ubicacion, lineas [{item, nombre, lote, sistema, fisico}].
 */
export function computeAlerts({ items = [], movs = [], conteos = [], cfg = DEF_CFG, ahora = Date.now() }) {
  const A = [];
  const add = (nivel, titulo, detalle, norma, itemId) => A.push({ nivel, titulo, detalle, norma, itemId: itemId ?? null });
  const hoy = hoyISO(new Date(ahora));
  const byId = new Map(items.map((i) => [String(i.id), i]));
  for (const it of items.filter((i) => i.activo !== false)) {
    const s = semaforo(it, cfg, hoy), saldo = Number(it.saldo) || 0;
    if (s === "vencido" && saldo > 0) add("critico", "Vencido con existencias", `${label(it)}: ${saldo} und. Separar en cuarentena y dar de baja con acta.`, "Res. 1403/2007 · Res. 3100/2019", it.id);
    else if (s === "rojo" && saldo > 0) add("medio", "Próximo a vencer (semáforo rojo)", `${label(it)} vence ${it.vencimiento} con ${saldo} und.`, "Res. 1403/2007", it.id);
    if (saldo < 0) add("critico", "Saldo negativo", `${label(it)} quedó en ${saldo}.`, "Control de existencias", it.id);
    if (it.stockMin && saldo >= 0 && saldo < Number(it.stockMin)) add("medio", "Bajo stock mínimo", `${label(it)}: ${saldo} de mínimo ${it.stockMin}.`, "Riesgo de desabastecimiento", it.id);
    const falt = [];
    if (!it.invima) falt.push("registro INVIMA");
    if (!it.lote && !it.serie) falt.push("lote o serie");
    if (!it.vencimiento && (it.tipo === "MED" || it.tipo === "INS")) falt.push("fecha de vencimiento");
    if (falt.length) add("alto", "Registro incompleto", `${label(it)}: falta ${falt.join(", ")}.`, "Res. 3100/2019 · Dec. 4725/2005", it.id);
  }

  const cerrados = conteos.filter((c) => c.estado === "cerrado").sort((a, b) => b.ts - a.ts);
  const faltPorItem = {};
  for (const c of cerrados) for (const l of c.lineas || []) {
    if (l.item && l.fisico != null && Number(l.fisico) < Number(l.sistema)) (faltPorItem[l.item] ||= []).push(Number(l.sistema) - Number(l.fisico));
  }
  if (cerrados[0]) {
    const c = cerrados[0];
    for (const l of c.lineas || []) {
      if (l.fisico == null) continue;
      const d = Number(l.fisico) - Number(l.sistema);
      if (d === 0) continue;
      const it = byId.get(String(l.item));
      if (d < 0) {
        const crit = it && (it.controlEspecial || it.tipo === "OST");
        add(crit ? "critico" : "alto", "Faltante en toma física", `${l.nombre} (lote ${l.lote || "s/l"}): faltan ${-d} und · conteo ${c.fecha} ${c.ubicacion || ""}.`, crit ? "Control especial / implantes: investigar" : "Res. 1403/2007", l.item);
      } else add("medio", "Sobrante en toma física", `${l.nombre} (lote ${l.lote || "s/l"}): sobran ${d} und.`, "Control de existencias", l.item);
    }
  }
  for (const [id, arr] of Object.entries(faltPorItem)) if (arr.length >= 2) {
    add("critico", "Patrón de pérdida recurrente", `${label(byId.get(id))}: faltantes en ${arr.length} tomas físicas (${arr.reduce((s, x) => s + x, 0)} und).`, "Investigar posible sustracción", id);
  }

  const d30 = ahora - 30 * DIA;
  for (const m of movs) {
    if (m.tipo === "USO" && m.itemTipo === "OST" && !m.paciente) add("alto", "Implante usado sin paciente", `${m.itemNombre} lote ${m.lote || "s/l"}.`, "Res. 4816/2008 · tecnovigilancia", m.item);
    if (m.tipo === "SAL" && !m.destino) add("medio", "Salida sin servicio destino", `${m.itemNombre} · ${m.cantidad} und · ${m.porNombre || ""}.`, "Trazabilidad", m.item);
  }
  for (const it of items.filter((i) => i.consignacion && (Number(i.saldo) || 0) > 0 && i.activo !== false)) {
    const propios = movs.filter((m) => String(m.item) === String(it.id));
    const ent = propios.filter((m) => m.tipo === "ENT").sort((a, b) => a.ts - b.ts)[0];
    const t0 = ent?.ts || it.creado || 0;
    const legal = propios.some((m) => (m.tipo === "USO" || m.tipo === "DEV_PROV") && m.ts > t0);
    const dias = Math.floor((ahora - t0) / DIA);
    if (t0 && !legal && dias > cfg.diasConsignacion) add("medio", "Consignación sin legalizar", `${label(it)} lleva ${dias} días sin uso ni devolución.`, "Control de material en consignación", it.id);
  }
  const neg = movs.filter((m) => (m.tipo === "AJ_NEG" || m.tipo === "BAJA") && m.ts > d30);
  const porU = {};
  neg.forEach((m) => { const k = String(m.por); (porU[k] ||= { n: 0, nombre: m.porNombre }).n++; });
  for (const o of Object.values(porU)) if (o.n >= 3 && o.n / neg.length > 0.5) add("alto", "Concentración de ajustes negativos", `${o.nombre || "Un usuario"} registró ${o.n} de ${neg.length} ajustes negativos o bajas en 30 días.`, "Segregación de funciones");
  const fuera = movs.filter((m) => { const h = new Date(m.ts).getHours(); return m.signo < 0 && m.ts > d30 && (h < cfg.horaInicio || h >= cfg.horaFin); });
  if (fuera.length) add("medio", "Salidas fuera de horario", `${fuera.length} salidas o ajustes negativos fuera de ${cfg.horaInicio}:00–${cfg.horaFin}:00 en 30 días.`, "Revisar en conjunto con turnos");

  const ord = { critico: 0, alto: 1, medio: 2 };
  return A.sort((a, b) => ord[a.nivel] - ord[b.nivel]);
}
