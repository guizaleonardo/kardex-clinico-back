import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEF_CFG, computeAlerts, itemKey, limpiarItem, resumenConteo, semaforo, validarMovimiento } from "../src/domain/kardex.js";

const HOY = "2026-01-01";
const base = { id: "i1", tipo: "MED", nombre: "Dipirona", lote: "A", invima: "X", vencimiento: "2030-01-01", saldo: 10, activo: true };

describe("semaforo", () => {
  it("clasifica por meses al vencimiento", () => {
    assert.equal(semaforo({ vencimiento: "" }, DEF_CFG, HOY), "sin");
    assert.equal(semaforo({ vencimiento: "2025-12-31" }, DEF_CFG, HOY), "vencido");
    assert.equal(semaforo({ vencimiento: "2026-03-01" }, DEF_CFG, HOY), "rojo");
    assert.equal(semaforo({ vencimiento: "2026-10-01" }, DEF_CFG, HOY), "amarillo");
    assert.equal(semaforo({ vencimiento: "2028-01-01" }, DEF_CFG, HOY), "verde");
  });
  it("respeta umbrales configurados", () => {
    assert.equal(semaforo({ vencimiento: "2026-03-01" }, { ...DEF_CFG, rojoMeses: 1, amarilloMeses: 3 }, HOY), "amarillo");
  });
});

describe("validarMovimiento", () => {
  const v = (it, d, o) => validarMovimiento(it, d, { hoy: HOY, ...o });
  it("acepta una salida válida", () => assert.equal(v(base, { tipo: "SAL", cantidad: 3, destino: "UCI" }), null));
  it("exige cantidad positiva", () => assert.match(v(base, { tipo: "ENT", cantidad: 0, soporte: "F1" }), /cantidad/));
  it("exige soporte en entradas", () => assert.match(v(base, { tipo: "ENT", cantidad: 1 }), /soporte/));
  it("exige destino en salidas", () => assert.match(v(base, { tipo: "SAL", cantidad: 1 }), /destino/));
  it("exige historia clínica para implantes", () => {
    assert.match(v({ ...base, tipo: "OST" }, { tipo: "USO", cantidad: 1 }), /historia clínica/);
    assert.equal(v({ ...base, tipo: "OST" }, { tipo: "USO", cantidad: 1, paciente: "123" }), null);
  });
  it("exige acta y motivo en ajustes y bajas", () => assert.match(v(base, { tipo: "AJ_NEG", cantidad: 1, soporte: "A1" }), /acta/));
  it("no permite salidas mayores al saldo", () => assert.match(v(base, { tipo: "SAL", cantidad: 11, destino: "UCI" }), /supera el saldo/));
  it("solo permite baja de lotes vencidos", () => {
    const venc = { ...base, vencimiento: "2025-01-01" };
    assert.match(v(venc, { tipo: "SAL", cantidad: 1, destino: "UCI" }), /vencido/);
    assert.equal(v(venc, { tipo: "BAJA", cantidad: 1, soporte: "A", motivo: "vencido" }), null);
    assert.equal(v(venc, { tipo: "AJ_NEG", cantidad: 1, soporte: "A", motivo: "m" }, { permitirVencido: true }), null);
  });
  it("rechaza ítems inactivos y tipos inválidos", () => {
    assert.match(v({ ...base, activo: false }, { tipo: "ENT", cantidad: 1, soporte: "F" }), /inactivo/);
    assert.match(v(base, { tipo: "XXX", cantidad: 1 }), /inválido/);
  });
});

describe("limpiarItem", () => {
  it("normaliza tipos de dato", () => {
    const { item, errores } = limpiarItem({ nombre: "  Gasa ", tipo: "INS", costo: "1500", cadenaFrio: 1, extra: "x" });
    assert.deepEqual(errores, []);
    assert.equal(item.nombre, "Gasa");
    assert.equal(item.costo, 1500);
    assert.equal(item.cadenaFrio, true);
    assert.equal("extra" in item, false);
  });
  it("reporta errores de validación", () => {
    const { errores } = limpiarItem({ tipo: "ZZ", vencimiento: "31/12/2026", costo: -1, riesgo: "IV" });
    assert.equal(errores.length, 5);
  });
  it("en modo parcial no exige nombre si no viene", () => {
    assert.deepEqual(limpiarItem({ costo: 10 }, { parcial: true }).errores, []);
  });
});

describe("itemKey", () => {
  it("ignora mayúsculas, tildes y signos", () => {
    assert.equal(itemKey({ codigo: "M-1", lote: "Ab 1", ubicacion: "Urgencias" }), itemKey({ codigo: "m1", lote: "AB-1", ubicacion: "urgéncias" }));
  });
});

describe("resumenConteo", () => {
  it("suma faltantes, sobrantes y valor", () => {
    const r = resumenConteo({ lineas: [{ item: "a", sistema: 10, fisico: 7 }, { item: "b", sistema: 2, fisico: 5 }, { item: "c", sistema: 1, fisico: null }] }, (id) => (id === "a" ? 1000 : 0));
    assert.deepEqual(r, { faltante: 3, sobrante: 3, valorFaltante: 3000, contadas: 2, lineas: 3 });
  });
});

describe("computeAlerts", () => {
  const ahora = new Date(HOY + "T12:00:00Z").getTime();
  const titulos = (a) => a.map((x) => x.titulo);
  it("detecta vencidos con saldo, saldo negativo, stock bajo y registro incompleto", () => {
    const a = computeAlerts({
      ahora,
      items: [
        { ...base, id: "v", vencimiento: "2025-06-01" },
        { ...base, id: "n", saldo: -2 },
        { ...base, id: "s", stockMin: 20 },
        { ...base, id: "x", invima: "", lote: "" },
      ],
    });
    assert.ok(titulos(a).includes("Vencido con existencias"));
    assert.ok(titulos(a).includes("Saldo negativo"));
    assert.ok(titulos(a).includes("Bajo stock mínimo"));
    assert.ok(titulos(a).includes("Registro incompleto"));
    assert.equal(a[0].nivel, "critico", "ordena críticos primero");
  });
  it("marca faltante de control especial como crítico y patrón recurrente", () => {
    const items = [{ ...base, id: "ce", controlEspecial: true }];
    const linea = { item: "ce", nombre: "Morfina", lote: "A", sistema: 10, fisico: 8 };
    const conteos = [
      { estado: "cerrado", ts: 2, fecha: HOY, lineas: [linea] },
      { estado: "cerrado", ts: 1, fecha: HOY, lineas: [linea] },
    ];
    const a = computeAlerts({ ahora, items, conteos });
    assert.equal(a.find((x) => x.titulo === "Faltante en toma física").nivel, "critico");
    assert.ok(titulos(a).includes("Patrón de pérdida recurrente"));
  });
  it("detecta implante sin paciente y concentración de ajustes negativos", () => {
    const m = (o) => ({ item: "i1", itemNombre: "Placa", cantidad: 1, signo: -1, ts: ahora - 1000, por: "u1", porNombre: "Ana", ...o });
    const movs = [m({ tipo: "USO", itemTipo: "OST" }), m({ tipo: "AJ_NEG" }), m({ tipo: "AJ_NEG" }), m({ tipo: "BAJA" })];
    const a = computeAlerts({ ahora, items: [base], movs, cfg: { ...DEF_CFG, horaInicio: 0, horaFin: 24 } });
    assert.ok(titulos(a).includes("Implante usado sin paciente"));
    assert.ok(titulos(a).includes("Concentración de ajustes negativos"));
    assert.ok(!titulos(a).includes("Salidas fuera de horario"));
  });
  it("detecta consignación sin legalizar", () => {
    const it = { ...base, consignacion: true, creado: ahora - 40 * 86400000 };
    assert.ok(titulos(computeAlerts({ ahora, items: [it] })).includes("Consignación sin legalizar"));
  });
});
