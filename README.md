# Kardex Clínico — Backend

API REST del Kardex Clínico (medicamentos, dispositivos, insumos y osteosíntesis) con usuarios, roles y control de acceso **por pantalla y por acción**.

- Node.js 22 · Express 5 · MongoDB (Mongoose 8) · JWT · bcrypt
- Pruebas: `node:test` + Supertest + `mongodb-memory-server` (no requiere Mongo instalado)

## Puesta en marcha

```bash
npm install
cp .env.example .env      # ajuste MONGO_URI, JWT_SECRET y ADMIN_PASSWORD
npm run dev               # API en http://localhost:4000
```

Sin Mongo disponible, `npm run dev:memoria` levanta la API con una base en memoria (los datos se pierden al cerrar).

Al iniciar se crean los roles base que falten y, si la base no tiene usuarios, el administrador inicial (`ADMIN_USER` / `ADMIN_PASSWORD`). Si la base ya tiene usuarios, cambiar `ADMIN_PASSWORD` en `.env` no modifica nada: use `npm run admin:restablecer`, que asigna esa contraseña a `ADMIN_USER` (lo crea si no existe) y le da el rol Administrador.

> En `.env`, un `#` sin comillas inicia un comentario y corta el valor. Escriba entre comillas las claves que lo contengan: `ADMIN_PASSWORD="abc#123"`.

## Pruebas

```bash
npm test
```

| Archivo | Qué cubre |
|---|---|
| `test/kardex.test.js` | Reglas de dominio: semáforo, validación de movimientos, limpieza de ítems, alertas |
| `test/permissions.test.js` | Catálogo de permisos, normalización, roles base |
| `test/auth.test.js` | Login, token, usuario inactivo, cambio de clave |
| `test/usuarios-roles.test.js` | CRUD de usuarios y roles, rol de sistema, último administrador, permisos por acción |
| `test/inventario.test.js` | Ítems, movimientos, kardex, concurrencia de saldo, importación |
| `test/conteos-analisis.test.js` | Toma física a ciegas, cierre, ajustes, panel, análisis, configuración |

## Modelo de permisos

Un permiso es `pantalla:accion`. Cada rol tiene una lista de permisos y un usuario puede tener varios roles (se suman). Los permisos se leen de la base en cada petición, así que un cambio de rol aplica de inmediato.

| Pantalla | Acciones |
|---|---|
| panel | ver |
| inventario | ver, crear, editar, inactivar, exportar |
| movimientos | ver, crear, exportar |
| conteos | ver, crear, contar, cerrar, ajustar, exportar |
| importar | ver, ejecutar |
| analisis | ver |
| normas | ver |
| ajustes | ver, editar |
| usuarios | ver, crear, editar, eliminar |
| roles | ver, crear, editar, eliminar |

Reglas:
- Cualquier acción implica `ver` de su pantalla (se normaliza al guardar el rol).
- El rol **Administrador** es de sistema: siempre tiene todos los permisos y no se puede eliminar ni renombrar.
- No se puede dejar el sistema sin un administrador activo, ni inactivar o eliminar el propio usuario.
- Un usuario con movimientos no se elimina (se inactiva) para conservar la trazabilidad.

Roles base: Administrador, Regente de farmacia, Auxiliar de farmacia, Auditor.

## Endpoints

Todos bajo `/api`, con `Authorization: Bearer <token>` salvo el login.

| Método | Ruta | Permiso |
|---|---|---|
| POST | `/auth/login` | — |
| GET | `/auth/me`, `/auth/catalogo` | sesión |
| POST | `/auth/cambiar-clave` | sesión |
| GET/POST/PUT/DELETE | `/usuarios` | `usuarios:ver/crear/editar/eliminar` |
| GET/POST/PUT/DELETE | `/roles` | `roles:ver/crear/editar/eliminar` |
| GET | `/items` | `inventario:ver` (o pantallas que usan el maestro) |
| GET | `/items/:id/kardex` | `inventario:ver` |
| POST | `/items` · PUT `/items/:id` · POST `/items/:id/inactivar` | `inventario:crear/editar/inactivar` |
| GET · POST | `/movimientos` | `movimientos:ver` · `movimientos:crear` |
| GET · POST | `/conteos` | `conteos:ver` · `conteos:crear` |
| PUT | `/conteos/:id/lineas` | `conteos:contar` |
| POST | `/conteos/:id/cerrar` · `/conteos/:id/ajustar` | `conteos:cerrar` · `conteos:ajustar` |
| GET · POST | `/importar/historial` · `/importar` | `importar:ver` · `importar:ejecutar` |
| GET | `/panel` · `/analisis` | `panel:ver` · `analisis:ver` |
| GET · PUT | `/config` | sesión · `ajustes:editar` |

## Reglas del kardex en el servidor

- El saldo solo cambia con movimientos; se actualiza con un `$inc` condicionado para que salidas simultáneas no lo dejen negativo.
- Entradas y devoluciones a proveedor exigen soporte; salidas exigen servicio destino; uso de implantes exige historia clínica; ajustes y bajas exigen acta y motivo.
- Lotes vencidos solo admiten baja (los ajustes de toma física sí se aplican).
- En un conteo a ciegas abierto, el saldo del sistema no se envía al cliente.
- Los movimientos no se editan ni se eliminan.
