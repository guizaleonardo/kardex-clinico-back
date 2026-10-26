import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PANTALLAS, ROLES_BASE, TODOS_LOS_PERMISOS, normalizarPermisos, tienePermiso } from "../src/permissions.js";
import { HttpError } from "../src/errors.js";

describe("catálogo de permisos", () => {
  it("cada pantalla tiene la acción ver", () => {
    for (const p of PANTALLAS) assert.ok(p.acciones.includes("ver"), p.clave);
  });
  it("los permisos son únicos y con formato pantalla:accion", () => {
    assert.equal(new Set(TODOS_LOS_PERMISOS).size, TODOS_LOS_PERMISOS.length);
    for (const p of TODOS_LOS_PERMISOS) assert.match(p, /^[a-z]+:[a-z]+$/);
  });
});

describe("normalizarPermisos", () => {
  it("agrega ver a la pantalla de cada acción y ordena según el catálogo", () => {
    assert.deepEqual(normalizarPermisos(["movimientos:crear", "inventario:editar"]), ["inventario:ver", "inventario:editar", "movimientos:ver", "movimientos:crear"]);
  });
  it("elimina duplicados", () => {
    assert.deepEqual(normalizarPermisos(["panel:ver", "panel:ver"]), ["panel:ver"]);
  });
  it("rechaza permisos desconocidos", () => {
    assert.throws(() => normalizarPermisos(["panel:borrar"]), (e) => e instanceof HttpError && e.status === 400);
    assert.throws(() => normalizarPermisos("panel:ver"), HttpError);
  });
});

describe("tienePermiso", () => {
  it("basta con uno de los requeridos", () => {
    assert.equal(tienePermiso(["a:ver"], "b:ver", "a:ver"), true);
    assert.equal(tienePermiso(new Set(["a:ver"]), "b:ver"), false);
  });
});

describe("roles base", () => {
  const rol = (n) => ROLES_BASE.find((r) => r.nombre === n);
  it("solo el administrador gestiona usuarios y roles", () => {
    for (const r of ROLES_BASE.filter((r) => !r.sistema)) assert.ok(!r.permisos.some((p) => /^(usuarios|roles):/.test(p)), r.nombre);
    assert.deepEqual(rol("Administrador").permisos, TODOS_LOS_PERMISOS);
  });
  it("el auditor no tiene acciones de escritura", () => {
    assert.ok(rol("Auditor").permisos.every((p) => p.endsWith(":ver") || p.endsWith(":exportar")));
  });
  it("los permisos de los roles base ya están normalizados", () => {
    for (const r of ROLES_BASE) assert.deepEqual(normalizarPermisos(r.permisos), r.permisos, r.nombre);
  });
});
