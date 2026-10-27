import { Router } from "express";
import { Importe, Item } from "../models.js";
import { authorize } from "../middleware/auth.js";
import { badRequest } from "../errors.js";
import { itemKey, limpiarItem } from "../domain/kardex.js";
import { registrarMovimiento } from "../services/movimientos.js";
import { buscarExistente, sumarAExistente } from "../services/items.js";
import { getConfig } from "../services/datos.js";

const MAX_FILAS = 5000;

export default function importarRoutes() {
  const r = Router();

  r.get("/historial", authorize("importar:ver"), async (_req, res) => {
    res.json(await Importe.find().sort({ ts: -1 }).limit(30).populate("por", "nombre"));
  });

  /**
   * Filas ya mapeadas en el cliente desde Excel/CSV.
   * destino "maestro": crea ítems con su cantidad como saldo inicial; si ya existen, suma la cantidad como Entrada.
   * destino "entrada": registra una Entrada por fila (crea el ítem si no existe) con el soporte indicado.
   */
  r.post("/", authorize("importar:ejecutar"), async (req, res) => {
    const { filas, destino = "maestro", soporte = "", archivo = "", fuente = "Excel" } = req.body || {};
    if (!Array.isArray(filas) || !filas.length) throw badRequest("No hay filas para importar");
    if (filas.length > MAX_FILAS) throw badRequest(`Máximo ${MAX_FILAS} filas por carga`);
    if (!["maestro", "entrada"].includes(destino)) throw badRequest("Destino inválido");
    if (destino === "entrada" && !String(soporte).trim()) throw badRequest("Las entradas requieren documento soporte (remisión o factura)");
    const cfg = await getConfig();
    const origen = `${fuente} ${archivo}`.trim();
    let creados = 0, entradas = 0, sumados = 0, omitidos = 0;
    const errores = [];

    for (const [i, fila] of filas.entries()) {
      const n = i + 1;
      const { item, errores: e } = limpiarItem(fila);
      const cantidad = Number(fila.cantidad) || 0;
      if (cantidad < 0) e.push("cantidad negativa");
      if (e.length) { errores.push(`Fila ${n}: ${e.join(", ")}`); omitidos++; continue; }
      const clave = itemKey(item);
      let it = await buscarExistente(item);
      if (destino === "maestro") {
        if (it) {
          if (!(cantidad > 0)) { omitidos++; continue; }
          try {
            await sumarAExistente({ item: it, cantidad, soporte: `Carga Excel ${archivo}`.trim(), usuarioId: req.user._id, cfg });
            sumados++;
          } catch (err) { errores.push(`Fila ${n}: ${err.message}`); omitidos++; }
          continue;
        }
        await Item.create({ ...item, clave, saldo: cantidad, saldoInicial: cantidad, origen, creadoPor: req.user._id });
        creados++;
      } else {
        if (!(cantidad > 0)) { errores.push(`Fila ${n}: la entrada requiere cantidad mayor que cero`); omitidos++; continue; }
        if (!it) { it = await Item.create({ ...item, clave, saldo: 0, saldoInicial: 0, origen, creadoPor: req.user._id }); creados++; }
        try {
          await registrarMovimiento({ itemId: it._id, usuarioId: req.user._id, cfg, data: { tipo: "ENT", cantidad, soporte } });
          entradas++;
        } catch (err) { errores.push(`Fila ${n}: ${err.message}`); omitidos++; }
      }
    }
    const imp = await Importe.create({ por: req.user._id, fuente, archivo, destino, soporte, filas: filas.length, creados, entradas, sumados, omitidos, errores: errores.slice(0, 200) });
    res.status(201).json(imp);
  });

  return r;
}
