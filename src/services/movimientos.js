import { Item, Movimiento } from "../models.js";
import { MOV, validarMovimiento } from "../domain/kardex.js";
import { badRequest, conflict, notFound } from "../errors.js";

/**
 * Registra un movimiento y actualiza el saldo del ítem.
 * El saldo se modifica con un $inc condicionado, así dos salidas simultáneas no pueden dejarlo negativo
 * (no requiere réplica set ni transacciones).
 */
export async function registrarMovimiento({ itemId, data, usuarioId, cfg, permitirVencido = false }) {
  const it = await Item.findById(itemId);
  if (!it) throw notFound("Ítem no encontrado");
  const d = {
    tipo: data.tipo,
    cantidad: Number(data.cantidad),
    soporte: String(data.soporte ?? "").trim(),
    destino: String(data.destino ?? "").trim(),
    paciente: String(data.paciente ?? "").trim(),
    motivo: String(data.motivo ?? "").trim(),
  };
  const err = validarMovimiento(it, d, { cfg, permitirVencido });
  if (err) throw badRequest(err);

  const signo = MOV[d.tipo].s;
  const filtro = { _id: it._id, activo: true, ...(signo < 0 ? { saldo: { $gte: d.cantidad } } : {}) };
  const actualizado = await Item.findOneAndUpdate(filtro, { $inc: { saldo: signo * d.cantidad }, actualizadoPor: usuarioId }, { new: true });
  if (!actualizado) throw conflict("El saldo cambió mientras registraba el movimiento; vuelva a intentarlo");

  return Movimiento.create({
    ...d,
    item: it._id,
    signo,
    saldoDespues: actualizado.saldo,
    saldoAntes: actualizado.saldo - signo * d.cantidad,
    conteo: data.conteo || undefined,
    itemNombre: it.nombre,
    itemTipo: it.tipo,
    lote: it.lote,
    serie: it.serie,
    ubicacion: it.ubicacion,
    costo: it.costo || 0,
    por: usuarioId,
  });
}
