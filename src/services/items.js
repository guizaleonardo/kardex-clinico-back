import { Item } from "../models.js";
import { itemKey, mismoProducto } from "../domain/kardex.js";
import { registrarMovimiento } from "./movimientos.js";

/** Ítem activo que corresponde al mismo producto, lote, serie y ubicación (ver mismoProducto). */
export async function buscarExistente(datos, excluirId) {
  // La clave termina en "|lote|serie|ubicacion" normalizados (solo [a-z0-9]): se usa para acotar candidatos.
  const [, lote, serie, ubic] = itemKey(datos).split("|");
  const candidatos = await Item.find({
    activo: true,
    clave: { $regex: `\|${lote}\|${serie}\|${ubic}$` },
    ...(excluirId ? { _id: { $ne: excluirId } } : {}),
  });
  return candidatos.find((c) => mismoProducto(c, datos)) || null;
}

/** Suma la cantidad al ítem existente como Entrada en el kardex (no se toca el saldo directamente). */
export function sumarAExistente({ item, cantidad, soporte, usuarioId, cfg }) {
  return registrarMovimiento({ itemId: item._id, usuarioId, cfg, data: { tipo: "ENT", cantidad, soporte } });
}
