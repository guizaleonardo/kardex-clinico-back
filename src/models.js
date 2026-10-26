import mongoose from "mongoose";
import { TIPOS, MOV, RIESGOS } from "./domain/kardex.js";

const { Schema, model } = mongoose;
const ref = (name) => ({ type: Schema.Types.ObjectId, ref: name });

// Respuestas JSON con "id" en lugar de "_id" y sin campos internos.
mongoose.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    delete ret._id;
    delete ret.passwordHash;
    return ret;
  },
});

const usuarioSchema = new Schema({
  username: { type: String, required: true, unique: true, trim: true, lowercase: true },
  nombre: { type: String, required: true, trim: true },
  email: { type: String, trim: true, default: "" },
  passwordHash: { type: String, required: true },
  roles: [ref("Rol")],
  activo: { type: Boolean, default: true },
  ultimoIngreso: Date,
}, { timestamps: true });

const rolSchema = new Schema({
  nombre: { type: String, required: true, unique: true, trim: true },
  descripcion: { type: String, default: "" },
  permisos: [{ type: String }],
  sistema: { type: Boolean, default: false },
}, { timestamps: true });

const itemSchema = new Schema({
  tipo: { type: String, enum: Object.keys(TIPOS), default: "MED" },
  codigo: { type: String, default: "" },
  nombre: { type: String, required: true },
  presentacion: { type: String, default: "" },
  invima: { type: String, default: "" },
  lote: { type: String, default: "" },
  serie: { type: String, default: "" },
  referencia: { type: String, default: "" },
  fabricante: { type: String, default: "" },
  proveedor: { type: String, default: "" },
  vencimiento: { type: String, default: "" },
  costo: { type: Number, default: null },
  ubicacion: { type: String, default: "" },
  stockMin: { type: Number, default: null },
  riesgo: { type: String, enum: RIESGOS, default: "" },
  cadenaFrio: { type: Boolean, default: false },
  controlEspecial: { type: Boolean, default: false },
  consignacion: { type: Boolean, default: false },
  saldo: { type: Number, default: 0 },
  saldoInicial: { type: Number, default: 0 },
  activo: { type: Boolean, default: true },
  origen: { type: String, default: "Manual" },
  clave: { type: String, index: true },
  creadoPor: ref("Usuario"),
  actualizadoPor: ref("Usuario"),
  inactivadoPor: ref("Usuario"),
  inactivado: Date,
}, { timestamps: { createdAt: "creado", updatedAt: "actualizado" } });

const movimientoSchema = new Schema({
  item: { ...ref("Item"), required: true, index: true },
  tipo: { type: String, enum: Object.keys(MOV), required: true },
  cantidad: { type: Number, required: true },
  signo: { type: Number, enum: [1, -1], required: true },
  saldoAntes: Number,
  saldoDespues: Number,
  soporte: { type: String, default: "" },
  destino: { type: String, default: "" },
  paciente: { type: String, default: "" },
  motivo: { type: String, default: "" },
  conteo: ref("Conteo"),
  // Copia del ítem al momento del movimiento (trazabilidad aunque el ítem cambie)
  itemNombre: String,
  itemTipo: String,
  lote: String,
  serie: String,
  ubicacion: String,
  costo: Number,
  ts: { type: Date, default: Date.now, index: true },
  por: ref("Usuario"),
});

const lineaSchema = new Schema({
  item: ref("Item"),
  nombre: String,
  lote: { type: String, default: "" },
  serie: { type: String, default: "" },
  venc: { type: String, default: "" },
  sistema: { type: Number, default: 0 },
  fisico: { type: Number, default: null },
  obs: { type: String, default: "" },
});

const conteoSchema = new Schema({
  fecha: String,
  ubicacion: { type: String, default: "" },
  tipo: { type: String, default: "" },
  testigo: { type: String, default: "" },
  ciega: { type: Boolean, default: true },
  estado: { type: String, enum: ["abierto", "cerrado"], default: "abierto" },
  lineas: [lineaSchema],
  ts: { type: Date, default: Date.now },
  por: ref("Usuario"),
  cerradoTs: Date,
  cerradoPor: ref("Usuario"),
  ajustado: { type: Boolean, default: false },
  actaAjuste: String,
  ajusteTs: Date,
  ajustePor: ref("Usuario"),
});

const configSchema = new Schema({
  _id: { type: String, default: "main" },
  servicios: [String],
  rojoMeses: Number,
  amarilloMeses: Number,
  diasConsignacion: Number,
  horaInicio: Number,
  horaFin: Number,
  por: ref("Usuario"),
}, { timestamps: { createdAt: false, updatedAt: "actualizado" } });

const importeSchema = new Schema({
  ts: { type: Date, default: Date.now },
  por: ref("Usuario"),
  fuente: String,
  archivo: String,
  destino: String,
  soporte: String,
  filas: Number,
  creados: Number,
  entradas: Number,
  omitidos: Number,
  errores: [String],
});

export const Usuario = model("Usuario", usuarioSchema);
export const Rol = model("Rol", rolSchema);
export const Item = model("Item", itemSchema);
export const Movimiento = model("Movimiento", movimientoSchema);
export const Conteo = model("Conteo", conteoSchema);
export const Config = model("Config", configSchema);
export const Importe = model("Importe", importeSchema);
