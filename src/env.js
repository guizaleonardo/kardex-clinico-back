import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Carga .env de la raíz del proyecto sin depender de cómo se lance node (npm, nodemon, IDE).
 * Las variables ya definidas en el entorno tienen prioridad sobre las del archivo.
 * Ojo: en valores sin comillas, "#" inicia un comentario; use comillas si una clave lo contiene.
 */
export function cargarEnv() {
  const envFile = fileURLToPath(new URL("../.env", import.meta.url));
  if (existsSync(envFile)) process.loadEnvFile(envFile);
}

/** Si la URI no trae base de datos (p. ej. ...mongodb.net/?appName=x), Mongo usaría "test". */
export function nombreBase(uri, explicito) {
  if (explicito) return explicito;
  try {
    return new URL(uri).pathname.replace(/^\//, "") || "kardex_clinico";
  } catch {
    return undefined; // URI con varios hosts: se respeta la base indicada en la propia URI
  }
}

export const ocultarClave = (uri) => uri.replace(/\/\/[^@]*@/, "//***@");
