import express from "express";
import cors from "cors";
import { authenticate } from "./middleware/auth.js";
import { errorHandler, notFound } from "./errors.js";
import authRoutes from "./routes/auth.js";
import usuariosRoutes from "./routes/usuarios.js";
import rolesRoutes from "./routes/roles.js";
import itemsRoutes from "./routes/items.js";
import movimientosRoutes from "./routes/movimientos.js";
import conteosRoutes from "./routes/conteos.js";
import analisisRoutes from "./routes/analisis.js";
import configRoutes from "./routes/config.js";
import importarRoutes from "./routes/importar.js";

export function createApp({ jwtSecret, jwtExpires = "8h", bcryptRounds = 10, corsOrigin } = {}) {
  if (!jwtSecret) throw new Error("JWT_SECRET es obligatorio");
  const app = express();
  app.locals.jwtSecret = jwtSecret;
  app.locals.jwtExpires = jwtExpires;
  app.locals.bcryptRounds = bcryptRounds;
  app.disable("x-powered-by");
  app.use(cors(corsOrigin ? { origin: corsOrigin.split(",") } : undefined));
  app.use(express.json({ limit: "10mb" }));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/auth", authRoutes());

  const api = express.Router();
  api.use(authenticate);
  api.use("/usuarios", usuariosRoutes());
  api.use("/roles", rolesRoutes());
  api.use("/items", itemsRoutes());
  api.use("/movimientos", movimientosRoutes());
  api.use("/conteos", conteosRoutes());
  api.use("/config", configRoutes());
  api.use("/importar", importarRoutes());
  api.use("/", analisisRoutes());
  app.use("/api", api);

  app.use((_req, _res, next) => next(notFound("Ruta no encontrada")));
  app.use(errorHandler);
  return app;
}
