import { badRequest } from "./errors.js";

/* Catálogo de pantallas y acciones. Un permiso es "pantalla:accion". */
export const ACCIONES = {
  ver: "Ver",
  crear: "Crear",
  editar: "Editar",
  inactivar: "Inactivar",
  eliminar: "Eliminar",
  exportar: "Exportar",
  contar: "Registrar conteo",
  cerrar: "Cerrar",
  ajustar: "Aplicar ajustes",
  ejecutar: "Ejecutar carga",
};

export const PANTALLAS = [
  { clave: "panel", nombre: "Panel", acciones: ["ver"] },
  { clave: "inventario", nombre: "Inventario", acciones: ["ver", "crear", "editar", "inactivar", "exportar"] },
  { clave: "movimientos", nombre: "Movimientos", acciones: ["ver", "crear", "exportar"] },
  { clave: "conteos", nombre: "Toma física", acciones: ["ver", "crear", "contar", "cerrar", "ajustar", "exportar"] },
  { clave: "importar", nombre: "Importar Excel", acciones: ["ver", "ejecutar"] },
  { clave: "analisis", nombre: "Análisis de riesgo", acciones: ["ver"] },
  { clave: "normas", nombre: "Marco normativo", acciones: ["ver"] },
  { clave: "ajustes", nombre: "Ajustes", acciones: ["ver", "editar"] },
  { clave: "usuarios", nombre: "Usuarios", acciones: ["ver", "crear", "editar", "eliminar"] },
  { clave: "roles", nombre: "Roles y permisos", acciones: ["ver", "crear", "editar", "eliminar"] },
];

export const TODOS_LOS_PERMISOS = PANTALLAS.flatMap((p) => p.acciones.map((a) => `${p.clave}:${a}`));
const VALIDOS = new Set(TODOS_LOS_PERMISOS);

/** Valida la lista y agrega "pantalla:ver" a toda pantalla con alguna acción: no se puede actuar sobre lo que no se ve. */
export function normalizarPermisos(lista) {
  if (!Array.isArray(lista)) throw badRequest("Los permisos deben ser una lista");
  const invalidos = lista.filter((p) => !VALIDOS.has(p));
  if (invalidos.length) throw badRequest(`Permisos desconocidos: ${invalidos.join(", ")}`);
  const out = new Set();
  for (const p of lista) {
    out.add(p);
    out.add(`${p.split(":")[0]}:ver`);
  }
  return TODOS_LOS_PERMISOS.filter((p) => out.has(p));
}

export function tienePermiso(permisos, ...requeridos) {
  const set = permisos instanceof Set ? permisos : new Set(permisos);
  return requeridos.some((p) => set.has(p));
}

const ADMIN_PANTALLAS = new Set(["usuarios", "roles"]);
const sin = (filtro) => TODOS_LOS_PERMISOS.filter(filtro);

export const ROLES_BASE = [
  { nombre: "Administrador", descripcion: "Acceso total, incluida la gestión de usuarios y roles", sistema: true, permisos: TODOS_LOS_PERMISOS },
  {
    nombre: "Regente de farmacia",
    descripcion: "Gestiona inventario, movimientos, tomas físicas, cargas y ajustes",
    permisos: sin((p) => !ADMIN_PANTALLAS.has(p.split(":")[0])),
  },
  {
    nombre: "Auxiliar de farmacia",
    descripcion: "Registra movimientos y diligencia conteos",
    permisos: ["panel:ver", "inventario:ver", "movimientos:ver", "movimientos:crear", "conteos:ver", "conteos:contar", "normas:ver"],
  },
  {
    nombre: "Auditor",
    descripcion: "Consulta y exporta sin modificar",
    permisos: sin((p) => !ADMIN_PANTALLAS.has(p.split(":")[0]) && (p.endsWith(":ver") || p.endsWith(":exportar"))),
  },
];
