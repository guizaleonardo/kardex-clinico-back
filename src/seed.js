import bcrypt from "bcryptjs";
import { Rol, Usuario } from "./models.js";
import { ROLES_BASE, TODOS_LOS_PERMISOS } from "./permissions.js";

/** Crea los roles base que falten y el administrador inicial si no hay usuarios. Idempotente. */
export async function seed({ adminUser = "admin", adminPassword, bcryptRounds = 10, log = () => {} } = {}) {
  for (const r of ROLES_BASE) {
    const existe = await Rol.findOne({ nombre: r.nombre });
    if (!existe) await Rol.create(r);
    // El rol de sistema siempre conserva todos los permisos, aunque el catálogo crezca.
    else if (existe.sistema) await Rol.updateOne({ _id: existe._id }, { permisos: TODOS_LOS_PERMISOS });
  }
  if ((await Usuario.countDocuments()) === 0) {
    if (!adminPassword) throw new Error("Defina ADMIN_PASSWORD para crear el administrador inicial");
    const admin = await Rol.findOne({ nombre: "Administrador" });
    await Usuario.create({
      username: adminUser,
      nombre: "Administrador",
      passwordHash: await bcrypt.hash(adminPassword, bcryptRounds),
      roles: [admin._id],
    });
    log(`Usuario administrador inicial creado: ${adminUser}`);
  }
}
