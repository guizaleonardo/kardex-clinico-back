import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { api, login, setupApi, usuarioCon } from "./helpers.js";

const ctx = setupApi();
const A = () => api(ctx.app, ctx.adminToken);
const rolId = async (nombre) => (await A().get("/api/roles")).body.find((r) => r.nombre === nombre).id;

describe("roles", () => {
  it("lista los roles base con el administrador primero", async () => {
    const res = await A().get("/api/roles");
    assert.equal(res.status, 200);
    assert.equal(res.body[0].nombre, "Administrador");
    assert.equal(res.body[0].usuarios, 1);
    assert.ok(res.body.some((r) => r.nombre === "Auditor"));
  });

  it("crea un rol normalizando permisos", async () => {
    const res = await A().post("/api/roles", { nombre: "Enfermería", permisos: ["movimientos:crear"] });
    assert.equal(res.status, 201);
    assert.deepEqual(res.body.permisos, ["movimientos:ver", "movimientos:crear"]);
  });

  it("rechaza permisos desconocidos y nombres repetidos", async () => {
    assert.equal((await A().post("/api/roles", { nombre: "X", permisos: ["inventario:volar"] })).status, 400);
    assert.equal((await A().post("/api/roles", { nombre: "Auditor" })).status, 409);
  });

  it("protege el rol de sistema", async () => {
    const id = await rolId("Administrador");
    assert.equal((await A().put(`/api/roles/${id}`, { permisos: ["panel:ver"] })).status, 400);
    assert.equal((await A().del(`/api/roles/${id}`)).status, 400);
    assert.equal((await A().put(`/api/roles/${id}`, { descripcion: "Todo" })).status, 200);
  });

  it("no elimina roles asignados y sí los libres", async () => {
    const asignado = await rolId("Auditor");
    await A().post("/api/usuarios", { username: "auditor1", nombre: "Auditor Uno", password: "Clave1234", roles: [asignado] });
    assert.equal((await A().del(`/api/roles/${asignado}`)).status, 409);
    const libre = (await A().post("/api/roles", { nombre: "Temporal" })).body.id;
    assert.equal((await A().del(`/api/roles/${libre}`)).status, 204);
  });

  it("el cambio de permisos aplica de inmediato a los usuarios del rol", async () => {
    const rol = (await A().post("/api/roles", { nombre: "Dinámico", permisos: ["panel:ver"] })).body;
    await A().post("/api/usuarios", { username: "dinamico", nombre: "Din", password: "Clave1234", roles: [rol.id] });
    const t = await login(ctx.app, "dinamico", "Clave1234");
    assert.equal((await api(ctx.app, t).get("/api/movimientos")).status, 200, "panel:ver permite consultar movimientos");
    assert.equal((await api(ctx.app, t).post("/api/roles", { nombre: "Z" })).status, 403);
    await A().put(`/api/roles/${rol.id}`, { permisos: ["roles:crear"] });
    assert.equal((await api(ctx.app, t).post("/api/roles", { nombre: "Z" })).status, 201);
    assert.equal((await api(ctx.app, t).get("/api/movimientos")).status, 403);
  });
});

describe("usuarios", () => {
  it("crea, lista y edita usuarios sin exponer la contraseña", async () => {
    const roles = [await rolId("Auxiliar de farmacia")];
    const c = await A().post("/api/usuarios", { username: "Maria.P", nombre: "María Pérez", password: "Clave1234", roles });
    assert.equal(c.status, 201);
    assert.equal(c.body.username, "maria.p");
    assert.equal(c.body.passwordHash, undefined);
    assert.equal(c.body.roles[0].nombre, "Auxiliar de farmacia");
    const lista = (await A().get("/api/usuarios")).body;
    assert.ok(lista.every((u) => u.passwordHash === undefined));
    const e = await A().put(`/api/usuarios/${c.body.id}`, { nombre: "María P.", activo: false });
    assert.equal(e.body.nombre, "María P.");
    assert.equal(e.body.activo, false);
  });

  it("valida datos obligatorios, duplicados y roles", async () => {
    const roles = [await rolId("Auditor")];
    assert.equal((await A().post("/api/usuarios", { username: "a b", nombre: "x", password: "Clave1234", roles })).status, 400);
    assert.equal((await A().post("/api/usuarios", { username: "nuevo", nombre: "x", password: "123", roles })).status, 400);
    assert.equal((await A().post("/api/usuarios", { username: "nuevo", nombre: "x", password: "Clave1234", roles: [] })).status, 400);
    assert.equal((await A().post("/api/usuarios", { username: "nuevo", nombre: "x", password: "Clave1234", roles: ["64b000000000000000000000"] })).status, 400);
    assert.equal((await A().post("/api/usuarios", { username: "admin", nombre: "x", password: "Clave1234", roles })).status, 409);
  });

  it("no permite quedarse sin administradores ni actuar sobre uno mismo", async () => {
    const me = (await A().get("/api/auth/me")).body.usuario.id;
    assert.equal((await A().put(`/api/usuarios/${me}`, { activo: false })).status, 400);
    assert.equal((await A().put(`/api/usuarios/${me}`, { roles: [await rolId("Auditor")] })).status, 409);
    assert.equal((await A().del(`/api/usuarios/${me}`)).status, 400);
  });

  it("permite quitar el rol administrador si queda otro administrador", async () => {
    const admin = await rolId("Administrador");
    const otro = (await A().post("/api/usuarios", { username: "admin2", nombre: "Admin 2", password: "Clave1234", roles: [admin] })).body;
    assert.equal((await A().put(`/api/usuarios/${otro.id}`, { roles: [await rolId("Auditor")] })).status, 200);
  });

  it("elimina usuarios sin movimientos", async () => {
    const u = (await A().post("/api/usuarios", { username: "borrar", nombre: "Borrar", password: "Clave1234", roles: [await rolId("Auditor")] })).body;
    assert.equal((await A().del(`/api/usuarios/${u.id}`)).status, 204);
    assert.equal((await A().del(`/api/usuarios/${u.id}`)).status, 404);
  });

  it("controla cada acción de la pantalla usuarios por separado", async () => {
    const soloVer = await usuarioCon(ctx.app, ["usuarios:ver"]);
    assert.equal((await api(ctx.app, soloVer).get("/api/usuarios")).status, 200);
    assert.equal((await api(ctx.app, soloVer).post("/api/usuarios", {})).status, 403);
    assert.equal((await api(ctx.app, soloVer).get("/api/roles")).status, 403);
    const creador = await usuarioCon(ctx.app, ["usuarios:ver", "usuarios:crear"]);
    assert.equal((await api(ctx.app, creador).get("/api/roles")).status, 200, "quien crea usuarios puede ver roles para asignarlos");
    assert.equal((await api(ctx.app, creador).del("/api/usuarios/64b000000000000000000000")).status, 403);
  });
});
