import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ITEM, api, setupApi, usuarioCon } from "./helpers.js";

const ctx = setupApi();
const A = () => api(ctx.app, ctx.adminToken);
let n = 0;
const nuevoItem = async (o = {}) => (await A().post("/api/items", { ...ITEM, lote: `N${++n}`, cantidad: 10, ...o })).body;

describe("inventario", () => {
  it("crea un ítem con saldo inicial", async () => {
    const res = await A().post("/api/items", { ...ITEM, cantidad: 25 });
    assert.equal(res.status, 201);
    assert.equal(res.body.saldo, 25);
    assert.equal(res.body.saldoInicial, 25);
  });

  it("si el producto ya existe suma la cantidad como entrada en su kardex", async () => {
    const res = await A().post("/api/items", { ...ITEM, codigo: "m 001", cantidad: 5, soporte: "FAC-55" });
    assert.equal(res.status, 200);
    assert.equal(res.body.sumado, true);
    assert.equal(res.body.cantidadSumada, 5);
    assert.equal(res.body.saldo, 30, "25 iniciales + 5");
    const k = await A().get(`/api/items/${res.body.id}/kardex`);
    assert.equal(k.body.movimientos.length, 1);
    assert.equal(k.body.movimientos[0].tipo, "ENT");
    assert.equal(k.body.movimientos[0].soporte, "FAC-55");
    assert.equal(k.body.coincide, true);
    const mismos = (await A().get("/api/items")).body.filter((i) => i.codigo === ITEM.codigo && i.lote === ITEM.lote && i.ubicacion === ITEM.ubicacion);
    assert.equal(mismos.length, 1, "no se crea una fila duplicada");
  });

  it("reconoce el producto por nombre cuando uno de los dos no tiene código", async () => {
    const res = await A().post("/api/items", { nombre: "acetaminofen", lote: "l1", ubicacion: "urgencias", cantidad: 2 });
    assert.equal(res.status, 200);
    assert.equal(res.body.saldo, 32);
    assert.equal((await A().get(`/api/items/${res.body.id}/kardex`)).body.movimientos.at(-1).soporte, "Ingreso manual desde Nuevo ítem");
  });

  it("otro lote, otra ubicación u otro código crean un ítem nuevo", async () => {
    assert.equal((await A().post("/api/items", { ...ITEM, ubicacion: "UCI" })).status, 201);
    assert.equal((await A().post("/api/items", { ...ITEM, lote: "OTRO" })).status, 201);
    assert.equal((await A().post("/api/items", { ...ITEM, codigo: "M-999" })).status, 201);
  });

  it("sin cantidad no hay nada que sumar a un existente", async () => {
    const res = await A().post("/api/items", { ...ITEM, cantidad: 0 });
    assert.equal(res.status, 409);
    assert.match(res.body.error, /cantidad/);
  });

  it("valida campos", async () => {
    const res = await A().post("/api/items", { tipo: "ZZ" });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /nombre/);
  });

  it("al editar no cambia el saldo", async () => {
    const it = await nuevoItem();
    const res = await A().put(`/api/items/${it.id}`, { nombre: "Nuevo nombre", saldo: 999 });
    assert.equal(res.body.nombre, "Nuevo nombre");
    assert.equal(res.body.saldo, 10);
  });

  it("solo inactiva ítems con saldo cero", async () => {
    const it = await nuevoItem();
    assert.equal((await A().post(`/api/items/${it.id}/inactivar`)).status, 400);
    const cero = await nuevoItem({ cantidad: 0 });
    assert.equal((await A().post(`/api/items/${cero.id}/inactivar`)).status, 200);
    const activos = (await A().get("/api/items")).body.map((i) => i.id);
    assert.ok(!activos.includes(cero.id));
  });

  it("aplica permisos por acción", async () => {
    const lector = await usuarioCon(ctx.app, ["inventario:ver"]);
    assert.equal((await api(ctx.app, lector).get("/api/items")).status, 200);
    assert.equal((await api(ctx.app, lector).post("/api/items", ITEM)).status, 403);
    const it = await nuevoItem();
    assert.equal((await api(ctx.app, lector).put(`/api/items/${it.id}`, { nombre: "x" })).status, 403);
    const editor = await usuarioCon(ctx.app, ["inventario:ver", "inventario:editar"]);
    assert.equal((await api(ctx.app, editor).put(`/api/items/${it.id}`, { nombre: "x" })).status, 200);
    assert.equal((await api(ctx.app, editor).post(`/api/items/${it.id}/inactivar`)).status, 403);
    const sinNada = await usuarioCon(ctx.app, ["normas:ver"]);
    assert.equal((await api(ctx.app, sinNada).get("/api/items")).status, 403);
  });
});

describe("movimientos y kardex", () => {
  it("registra entradas y salidas actualizando el saldo", async () => {
    const it = await nuevoItem();
    const e = await A().post("/api/movimientos", { item: it.id, tipo: "ENT", cantidad: 5, soporte: "FAC-1" });
    assert.equal(e.status, 201);
    assert.equal(e.body.saldoAntes, 10);
    assert.equal(e.body.saldoDespues, 15);
    const s = await A().post("/api/movimientos", { item: it.id, tipo: "SAL", cantidad: 4, destino: "UCI" });
    assert.equal(s.body.saldoDespues, 11);
    const k = await A().get(`/api/items/${it.id}/kardex`);
    assert.equal(k.body.movimientos.length, 2);
    assert.equal(k.body.saldoReconstruido, 11);
    assert.equal(k.body.coincide, true);
    assert.equal(k.body.movimientos[0].por.nombre, "Administrador");
  });

  it("aplica las reglas de soporte y saldo", async () => {
    const it = await nuevoItem();
    assert.equal((await A().post("/api/movimientos", { item: it.id, tipo: "ENT", cantidad: 1 })).status, 400);
    assert.equal((await A().post("/api/movimientos", { item: it.id, tipo: "SAL", cantidad: 50, destino: "UCI" })).status, 400);
    assert.equal((await A().post("/api/movimientos", { tipo: "SAL", cantidad: 1 })).status, 400);
  });

  it("no permite que salidas concurrentes dejen saldo negativo", async () => {
    const it = await nuevoItem({ cantidad: 3 });
    const rs = await Promise.all([1, 2, 3, 4, 5].map(() => A().post("/api/movimientos", { item: it.id, tipo: "SAL", cantidad: 1, destino: "UCI" })));
    assert.equal(rs.filter((r) => r.status === 201).length, 3);
    const k = await A().get(`/api/items/${it.id}/kardex`);
    assert.equal(k.body.item.saldo, 0);
    assert.equal(k.body.coincide, true);
  });

  it("filtra movimientos", async () => {
    const it = await nuevoItem({ nombre: "Ketorolaco" });
    await A().post("/api/movimientos", { item: it.id, tipo: "ENT", cantidad: 1, soporte: "REM-77" });
    const res = await A().get("/api/movimientos?q=rem-77&tipo=ENT");
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].itemNombre, "Ketorolaco");
  });

  it("separa ver de crear movimientos", async () => {
    const it = await nuevoItem();
    const lector = await usuarioCon(ctx.app, ["movimientos:ver"]);
    assert.equal((await api(ctx.app, lector).get("/api/movimientos")).status, 200);
    assert.equal((await api(ctx.app, lector).post("/api/movimientos", { item: it.id, tipo: "ENT", cantidad: 1, soporte: "F" })).status, 403);
    const aux = await usuarioCon(ctx.app, ["movimientos:ver", "movimientos:crear"]);
    assert.equal((await api(ctx.app, aux).post("/api/movimientos", { item: it.id, tipo: "ENT", cantidad: 1, soporte: "F" })).status, 201);
    assert.equal((await api(ctx.app, aux).get(`/api/items/${it.id}/kardex`)).status, 403, "el kardex por ítem es de la pantalla inventario");
  });
});

describe("importar", () => {
  it("carga el maestro sumando a los existentes y omitiendo filas inválidas", async () => {
    const filas = [
      { nombre: "Gasa", tipo: "INS", lote: "G1", cantidad: 100, ubicacion: "Cirugía" },
      { nombre: "Gasa", tipo: "INS", lote: "G1", cantidad: 100, ubicacion: "Cirugía" },
      { tipo: "INS", lote: "G2" },
    ];
    const res = await A().post("/api/importar", { filas, destino: "maestro", archivo: "inv.xlsx" });
    assert.equal(res.status, 201);
    assert.equal(res.body.creados, 1);
    assert.equal(res.body.sumados, 1);
    assert.equal(res.body.omitidos, 1);
    assert.equal(res.body.errores.length, 1);
    const gasa = (await A().get("/api/items")).body.filter((i) => i.nombre === "Gasa");
    assert.equal(gasa.length, 1);
    assert.equal(gasa[0].saldo, 200);
    const k = await A().get(`/api/items/${gasa[0].id}/kardex`);
    assert.equal(k.body.movimientos[0].soporte, "Carga Excel inv.xlsx");
    assert.equal((await A().get("/api/importar/historial")).body.length, 1);
  });

  it("registra entradas con soporte obligatorio", async () => {
    const filas = [{ nombre: "Tornillo cortical", tipo: "OST", referencia: "T-35", lote: "T1", cantidad: 4 }];
    assert.equal((await A().post("/api/importar", { filas, destino: "entrada" })).status, 400);
    const res = await A().post("/api/importar", { filas, destino: "entrada", soporte: "REM-9" });
    assert.equal(res.body.entradas, 1);
    const it = (await A().get("/api/items")).body.find((i) => i.nombre === "Tornillo cortical");
    assert.equal(it.saldo, 4);
  });

  it("exige importar:ejecutar", async () => {
    const t = await usuarioCon(ctx.app, ["importar:ver"]);
    assert.equal((await api(ctx.app, t).get("/api/importar/historial")).status, 200);
    assert.equal((await api(ctx.app, t).post("/api/importar", { filas: [{ nombre: "x" }] })).status, 403);
  });
});
