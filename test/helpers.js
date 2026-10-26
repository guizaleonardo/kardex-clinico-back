import { after, before } from "node:test";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { seed } from "../src/seed.js";
import { Rol, Usuario } from "../src/models.js";

export const ADMIN = { username: "admin", password: "Admin123*" };

/** Levanta una base Mongo en memoria y la app; cada archivo de pruebas tiene su propia base. */
export function setupApi() {
  const ctx = {};
  let mongo;
  before(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await seed({ adminUser: ADMIN.username, adminPassword: ADMIN.password, bcryptRounds: 4 });
    ctx.app = createApp({ jwtSecret: "test-secret", bcryptRounds: 4 });
    ctx.adminToken = await login(ctx.app, ADMIN.username, ADMIN.password);
  });
  after(async () => {
    await mongoose.disconnect();
    await mongo?.stop();
  });
  return ctx;
}

export async function login(app, username, password) {
  const res = await request(app).post("/api/auth/login").send({ username, password });
  if (res.status !== 200) throw new Error(`login ${username}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token;
}

/** Crea un usuario con un rol ad hoc que tiene exactamente los permisos indicados y devuelve su token. */
export async function usuarioCon(app, permisos, username = `u${Date.now()}${Math.floor(Math.random() * 1e4)}`) {
  const rol = await Rol.create({ nombre: `rol-${username}`, permisos });
  await Usuario.create({ username, nombre: username, passwordHash: await bcrypt.hash("Clave1234", 4), roles: [rol._id] });
  return login(app, username, "Clave1234");
}

export const api = (app, token) => {
  const auth = (r) => (token ? r.set("Authorization", `Bearer ${token}`) : r);
  return {
    get: (u) => auth(request(app).get(u)),
    post: (u, b) => auth(request(app).post(u)).send(b),
    put: (u, b) => auth(request(app).put(u)).send(b),
    del: (u) => auth(request(app).delete(u)),
  };
};

export const ITEM = { tipo: "MED", codigo: "M-001", nombre: "Acetaminofén", presentacion: "500 mg tableta", invima: "INVIMA 2020M-0001", lote: "L1", vencimiento: "2099-12-31", ubicacion: "Urgencias", costo: 100 };
