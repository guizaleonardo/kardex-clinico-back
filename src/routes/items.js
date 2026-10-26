import { Router } from "express";
import { Item, Movimiento } from "../models.js";
import { authorize } from "../middleware/auth.js";
import { badRequest, conflict, notFound } from "../errors.js";
import { itemKey, limpiarItem } from "../domain/kardex.js";

async function verificarDuplicado(datos, excluirId) {
  const clave = itemKey(datos);
  const dup = await Item.exists({ clave, activo: true, ...(excluirId ? { _id: { $ne: excluirId } } : {}) });
  if (dup) throw conflict("Ya existe un ítem con ese código, lote, serie y ubicación");
  return clave;
}

export default function itemsRoutes() {
  const r = Router();

  // El maestro se necesita en varias pantallas (selector de productos, panel, conteos).
  r.get("/", authorize("inventario:ver", "movimientos:ver", "movimientos:crear", "conteos:ver", "panel:ver"), async (req, res) => {
    const filtro = req.query.todos === "1" ? {} : { activo: true };
    res.json(await Item.find(filtro).sort({ vencimiento: 1, nombre: 1 }));
  });

  r.get("/:id/kardex", authorize("inventario:ver"), async (req, res) => {
    const item = await Item.findById(req.params.id).populate("creadoPor", "nombre");
    if (!item) throw notFound("Ítem no encontrado");
    const movs = await Movimiento.find({ item: item._id }).sort({ ts: 1 }).populate("por", "nombre");
    let saldo = item.saldoInicial || 0;
    const filas = movs.map((m) => { saldo += m.signo * m.cantidad; return { ...m.toJSON(), saldoCalculado: saldo }; });
    res.json({ item, movimientos: filas, saldoReconstruido: saldo, coincide: saldo === item.saldo });
  });

  r.post("/", authorize("inventario:crear"), async (req, res) => {
    const { item, errores } = limpiarItem(req.body);
    const cantidad = Number(req.body?.cantidad) || 0;
    if (cantidad < 0) errores.push("La cantidad inicial no puede ser negativa");
    if (errores.length) throw badRequest(errores.join(". "));
    const clave = await verificarDuplicado(item);
    const nuevo = await Item.create({ ...item, clave, saldo: cantidad, saldoInicial: cantidad, origen: "Manual", creadoPor: req.user._id });
    res.status(201).json(nuevo);
  });

  r.put("/:id", authorize("inventario:editar"), async (req, res) => {
    const it = await Item.findById(req.params.id);
    if (!it) throw notFound("Ítem no encontrado");
    // El saldo solo cambia con movimientos: se ignoran saldo/cantidad en la edición.
    const { item, errores } = limpiarItem(req.body, { parcial: true });
    if (errores.length) throw badRequest(errores.join(". "));
    Object.assign(it, item);
    it.clave = await verificarDuplicado(it, it._id);
    it.actualizadoPor = req.user._id;
    await it.save();
    res.json(it);
  });

  r.post("/:id/inactivar", authorize("inventario:inactivar"), async (req, res) => {
    const it = await Item.findById(req.params.id);
    if (!it) throw notFound("Ítem no encontrado");
    if ((it.saldo || 0) !== 0) throw badRequest("Lleve el saldo a cero con una baja o ajuste antes de inactivar");
    Object.assign(it, { activo: false, inactivado: new Date(), inactivadoPor: req.user._id });
    await it.save();
    res.json(it);
  });

  return r;
}
