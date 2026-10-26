import { describe, it } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { ADMIN, api, setupApi, usuarioCon } from "./helpers.js";
import { TODOS_LOS_PERMISOS } from "../src/permissions.js";
import { Usuario } from "../src/models.js";

const ctx = setupApi();

describe("autenticación", () => {
  it("el login devuelve token, usuario y permisos", async () => {
    const res = await api(ctx.app).post("/api/auth/login", ADMIN);
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.equal(res.body.usuario.username, "admin");
    assert.equal(res.body.usuario.passwordHash, undefined);
    assert.deepEqual(res.body.permisos, TODOS_LOS_PERMISOS);
  });

  it("rechaza contraseña incorrecta y usuario inexistente con el mismo mensaje", async () => {
    const a = await api(ctx.app).post("/api/auth/login", { username: "admin", password: "mala" });
    const b = await api(ctx.app).post("/api/auth/login", { username: "nadie", password: "mala" });
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.equal(a.body.error, b.body.error);
  });

  it("exige token en rutas protegidas", async () => {
    assert.equal((await api(ctx.app).get("/api/items")).status, 401);
    assert.equal((await api(ctx.app, "basura").get("/api/items")).status, 401);
    const vencido = jwt.sign({ sub: "x" }, "test-secret", { expiresIn: -10 });
    assert.equal((await api(ctx.app, vencido).get("/api/items")).status, 401);
  });

  it("/me refleja los permisos vigentes del rol", async () => {
    const t = await usuarioCon(ctx.app, ["panel:ver"], "lector");
    const res = await api(ctx.app, t).get("/api/auth/me");
    assert.deepEqual(res.body.permisos, ["panel:ver"]);
  });

  it("un usuario inactivo pierde el acceso aunque tenga token", async () => {
    const t = await usuarioCon(ctx.app, ["panel:ver"], "inactivo");
    await Usuario.updateOne({ username: "inactivo" }, { activo: false });
    assert.equal((await api(ctx.app, t).get("/api/auth/me")).status, 401);
  });

  it("cambia la contraseña verificando la actual", async () => {
    const t = await usuarioCon(ctx.app, ["panel:ver"], "clave");
    assert.equal((await api(ctx.app, t).post("/api/auth/cambiar-clave", { actual: "x", nueva: "NuevaClave1" })).status, 400);
    assert.equal((await api(ctx.app, t).post("/api/auth/cambiar-clave", { actual: "Clave1234", nueva: "corta" })).status, 400);
    assert.equal((await api(ctx.app, t).post("/api/auth/cambiar-clave", { actual: "Clave1234", nueva: "NuevaClave1" })).status, 200);
    assert.equal((await api(ctx.app).post("/api/auth/login", { username: "clave", password: "NuevaClave1" })).status, 200);
  });

  it("expone el catálogo de pantallas y acciones", async () => {
    const res = await api(ctx.app, ctx.adminToken).get("/api/auth/catalogo");
    assert.ok(res.body.pantallas.find((p) => p.clave === "inventario").acciones.includes("crear"));
  });
});
