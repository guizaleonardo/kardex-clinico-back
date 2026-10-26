// Restablece la contraseña de ADMIN_USER con el valor de ADMIN_PASSWORD (.env), lo activa y le asigna el rol Administrador.
// Si el usuario no existe, lo crea. Uso: npm run admin:restablecer
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { cargarEnv, nombreBase, ocultarClave } from "../src/env.js";
import { seed } from "../src/seed.js";
import { Rol, Usuario } from "../src/models.js";
import { MIN_CLAVE } from "../src/routes/auth.js";

cargarEnv();
const { MONGO_URI, MONGO_DB, ADMIN_USER = "admin", ADMIN_PASSWORD } = process.env;

if (!MONGO_URI) throw new Error("Falta MONGO_URI en .env");
if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < MIN_CLAVE) {
  console.error(`ADMIN_PASSWORD debe tener al menos ${MIN_CLAVE} caracteres tal como la lee Node (hoy: ${ADMIN_PASSWORD?.length ?? 0}).`);
  console.error('Si contiene "#", escríbala entre comillas en .env: ADMIN_PASSWORD="..."');
  process.exit(1);
}

await mongoose.connect(MONGO_URI, { dbName: nombreBase(MONGO_URI, MONGO_DB), serverSelectionTimeoutMS: 10000 });
console.log(`Base "${mongoose.connection.name}" en ${ocultarClave(MONGO_URI)}`);
await seed({ adminPassword: ADMIN_PASSWORD }); // garantiza que existan los roles base

const admin = await Rol.findOne({ sistema: true });
const username = ADMIN_USER.trim().toLowerCase();
const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
const u = await Usuario.findOne({ username });
if (u) {
  u.passwordHash = passwordHash;
  u.activo = true;
  if (!u.roles.some((r) => String(r) === String(admin._id))) u.roles.push(admin._id);
  await u.save();
  console.log(`Contraseña de "${username}" restablecida; usuario activo con rol Administrador.`);
} else {
  await Usuario.create({ username, nombre: "Administrador", passwordHash, roles: [admin._id] });
  console.log(`Usuario "${username}" creado con rol Administrador.`);
}
await mongoose.disconnect();
