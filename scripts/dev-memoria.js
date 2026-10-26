// Levanta la API con una base MongoDB en memoria (datos se pierden al cerrar). Útil para demos y pruebas manuales.
import { MongoMemoryServer } from "mongodb-memory-server";

const mongo = await MongoMemoryServer.create();
process.env.MONGO_URI = mongo.getUri("kardex_clinico");
process.env.JWT_SECRET ||= "secreto-solo-desarrollo";
process.env.ADMIN_PASSWORD ||= "Admin123*";
console.log("MongoDB en memoria:", process.env.MONGO_URI);
await import("../src/server.js");
