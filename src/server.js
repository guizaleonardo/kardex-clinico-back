import mongoose from "mongoose";
import { createApp } from "./app.js";
import { seed } from "./seed.js";
import { cargarEnv, nombreBase, ocultarClave } from "./env.js";

cargarEnv();

const {
  PORT = 4000,
  MONGO_URI,
  MONGO_DB,
  JWT_SECRET,
  JWT_EXPIRES = "8h",
  CORS_ORIGIN,
  ADMIN_USER = "admin",
  ADMIN_PASSWORD,
} = process.env;

if (!MONGO_URI) {
  console.error("Falta MONGO_URI: defínala en .env o en el entorno (vea .env.example).");
  process.exit(1);
}

try {
  await mongoose.connect(MONGO_URI, { dbName: nombreBase(MONGO_URI, MONGO_DB), serverSelectionTimeoutMS: 10000 });
} catch (e) {
  console.error(`No se pudo conectar a MongoDB (${ocultarClave(MONGO_URI)}): ${e.message}`);
  process.exit(1);
}
console.log(`MongoDB conectado · base "${mongoose.connection.name}"`);
await seed({ adminUser: ADMIN_USER, adminPassword: ADMIN_PASSWORD, log: console.log });

const app = createApp({ jwtSecret: JWT_SECRET, jwtExpires: JWT_EXPIRES, corsOrigin: CORS_ORIGIN });
app.listen(PORT, () => console.log(`API Kardex Clínico en http://localhost:${PORT}`));
