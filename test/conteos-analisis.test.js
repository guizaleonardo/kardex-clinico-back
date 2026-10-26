import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ITEM, api, setupApi, usuarioCon } from "./helpers.js";

const ctx = setupApi();
const A = () => api(ctx.app, ctx.adminToken);

describe("toma física", () => {
  let item, conteo;

  it("crea la planilla con los ítems de la ubicación y oculta el saldo si es a ciegas", async () => {
    item = (await A().post("/api/items", { ...ITEM, controlEspecial: true, cantidad: 10 })).body;
    await A().post("/api/items", { ...ITEM, lote: "OTRA", ubicacion: "UCI", cantidad: 5 });
    const res = await A().post("/api/conteos", { ubicacion: "Urgencias", testigo: "Jefe UCI", ciega: true });
    assert.equal(res.status, 201);
    conteo = res.body;
    assert.equal(conteo.lineas.length, 1);
    assert.equal(conteo.lineas[0].sistema, undefined, "el saldo del sistema no se envía en conteo a ciegas");
    const get = await A().get(`/api/conteos/${conteo.id}`);
    assert.equal(get.body.lineas[0].sistema, undefined);
  });

  it("registra cantidades y valida valores", async () => {
    const linea = conteo.lineas[0].id;
    assert.equal((await A().put(`/api/conteos/${conteo.id}/lineas`, { lineas: [{ id: linea, fisico: -1 }] })).status, 400);
    const res = await A().put(`/api/conteos/${conteo.id}/lineas`, { lineas: [{ id: linea, fisico: 7, obs: "faltan 3" }] });
    assert.equal(res.body.lineas[0].fisico, 7);
    assert.equal(res.body.resumen.contadas, 1);
  });

  it("al cerrar exige testigo y muestra las diferencias", async () => {
    const res = await A().post(`/api/conteos/${conteo.id}/cerrar`, { testigo: "Jefe UCI" });
    assert.equal(res.status, 200);
    assert.equal(res.body.estado, "cerrado");
    assert.equal(res.body.lineas[0].sistema, 10);
    assert.equal(res.body.resumen.faltante, 3);
    assert.equal(res.body.resumen.valorFaltante, 300);
    assert.equal((await A().put(`/api/conteos/${conteo.id}/lineas`, { lineas: [] })).status, 409);
  });

  it("el análisis reporta el faltante de control especial como crítico", async () => {
    const res = await A().get("/api/analisis");
    const a = res.body.alertas.find((x) => x.titulo === "Faltante en toma física");
    assert.equal(a.nivel, "critico");
    assert.equal(res.body.faltantes[0].unidades, 3);
    const panel = await A().get("/api/panel");
    assert.equal(panel.body.kpis.faltanteUltimaToma, 3);
    assert.equal(panel.body.kpis.referencias, 2);
  });

  it("aplica ajustes una sola vez y deja el saldo igual a lo contado", async () => {
    assert.equal((await A().post(`/api/conteos/${conteo.id}/ajustar`, { acta: "" })).status, 400);
    const res = await A().post(`/api/conteos/${conteo.id}/ajustar`, { acta: "ACTA-1", motivo: "Toma física" });
    assert.equal(res.body.aplicados, 1);
    assert.equal(res.body.conteo.ajustado, true);
    const k = await A().get(`/api/items/${item.id}/kardex`);
    assert.equal(k.body.item.saldo, 7);
    assert.equal(k.body.movimientos.at(-1).tipo, "AJ_NEG");
    assert.equal((await A().post(`/api/conteos/${conteo.id}/ajustar`, { acta: "ACTA-1", motivo: "x" })).status, 409);
  });

  it("controla cada acción del conteo por permiso", async () => {
    const contador = await usuarioCon(ctx.app, ["conteos:ver", "conteos:contar"]);
    const c = (await A().post("/api/conteos", { ubicacion: "UCI", testigo: "T" })).body;
    const C = api(ctx.app, contador);
    assert.equal((await C.post("/api/conteos", {})).status, 403);
    assert.equal((await C.put(`/api/conteos/${c.id}/lineas`, { lineas: [{ id: c.lineas[0].id, fisico: 5 }] })).status, 200);
    assert.equal((await C.post(`/api/conteos/${c.id}/cerrar`, { testigo: "T" })).status, 403);
    assert.equal((await C.post(`/api/conteos/${c.id}/ajustar`, { acta: "A", motivo: "m" })).status, 403);
    assert.equal((await C.get("/api/analisis")).status, 403);
  });
});

describe("ajustes (configuración)", () => {
  it("cualquier usuario autenticado lee la configuración", async () => {
    const t = await usuarioCon(ctx.app, ["normas:ver"]);
    const res = await api(ctx.app, t).get("/api/config");
    assert.equal(res.status, 200);
    assert.ok(res.body.servicios.includes("Urgencias"));
  });

  it("solo ajustes:editar guarda y se validan los umbrales", async () => {
    const t = await usuarioCon(ctx.app, ["ajustes:ver"]);
    const cfg = { servicios: ["Farmacia", "UCI"], rojoMeses: 3, amarilloMeses: 9, diasConsignacion: 15, horaInicio: 7, horaFin: 19 };
    assert.equal((await api(ctx.app, t).put("/api/config", cfg)).status, 403);
    assert.equal((await A().put("/api/config", { ...cfg, amarilloMeses: 2 })).status, 400);
    const ok = await A().put("/api/config", cfg);
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body.servicios, ["Farmacia", "UCI"]);
    assert.equal((await A().get("/api/config")).body.rojoMeses, 3);
  });
});
