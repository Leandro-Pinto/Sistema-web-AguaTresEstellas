import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ErrorConflicto, ErrorNoEncontrado, ErrorReglaNegocio } from '../utils/errors';
import { hashPassword, validarFortalezaPassword } from '../utils/password';
import { construirPaginacion } from '../utils/paginacion';
import { registrarHistorial } from './historial.service';
import type {
  ActualizarUsuarioInput,
  CrearUsuarioInput,
  ListarUsuariosQuery,
} from '../validators/usuarios.validator';
import { AccionHistorial, TipoRegistroHistorial } from '@prisma/client';

const construirNombreCompleto = (nombres: string, apellidos: string) =>
  `${nombres} ${apellidos}`.replace(/\s+/g, ' ').trim();

const SELECT_USUARIO = {
  id: true,
  nombres: true,
  apellidos: true,
  nombreCompleto: true,
  email: true,
  telefono: true,
  activo: true,
  ultimoAcceso: true,
  debeCambiarPassword: true,
  creadoEn: true,
  eliminadoEn: true,
  rol: { select: { id: true, nombre: true, nivel: true, activo: true } },
} satisfies Prisma.UsuarioSelect;

export const listarUsuarios = async (filtros: ListarUsuariosQuery) => {
  const where: Prisma.UsuarioWhereInput = {
    ...(filtros.incluirEliminados === 'true' ? {} : { eliminadoEn: null }),
    ...(filtros.activo !== 'todos' ? { activo: filtros.activo === 'true' } : {}),
    ...(filtros.rolId ? { rolId: filtros.rolId } : {}),
    ...(filtros.busqueda
      ? {
          OR: [
            { nombreCompleto: { contains: filtros.busqueda } },
            { email: { contains: filtros.busqueda } },
          ],
        }
      : {}),
  };

  const [total, datos] = await prisma.$transaction([
    prisma.usuario.count({ where }),
    prisma.usuario.findMany({
      where,
      orderBy: { [filtros.ordenarPor ?? 'nombreCompleto']: filtros.orden },
      skip: (filtros.pagina - 1) * filtros.limite,
      take: filtros.limite,
      select: SELECT_USUARIO,
    }),
  ]);

  return construirPaginacion(datos, total, filtros.pagina, filtros.limite);
};

export const obtenerUsuario = async (id: number) => {
  const usuario = await prisma.usuario.findUnique({ where: { id }, select: SELECT_USUARIO });
  if (!usuario) throw new ErrorNoEncontrado('Usuario');
  return usuario;
};

export const crearUsuario = async (entrada: CrearUsuarioInput) => {
  const error = validarFortalezaPassword(entrada.password);
  if (error) throw new ErrorReglaNegocio(error, 'PASSWORD_DEBIL');

  const email = entrada.email.toLowerCase();
  const existente = await prisma.usuario.findUnique({ where: { email } });
  if (existente) {
    throw new ErrorConflicto('Ya existe un usuario registrado con ese correo electrónico', 'EMAIL_DUPLICADO');
  }

  const rol = await prisma.rol.findUnique({ where: { id: entrada.rolId } });
  if (!rol) throw new ErrorNoEncontrado('Rol');
  if (!rol.activo) throw new ErrorReglaNegocio('El rol seleccionado no está activo', 'ROL_INACTIVO');

  return prisma.$transaction(async (tx) => {
    const usuario = await tx.usuario.create({
      data: {
        nombres: entrada.nombres,
        apellidos: entrada.apellidos,
        nombreCompleto: construirNombreCompleto(entrada.nombres, entrada.apellidos),
        email,
        telefono: entrada.telefono ?? null,
        passwordHash: await hashPassword(entrada.password),
        rolId: entrada.rolId,
        activo: entrada.activo,
        debeCambiarPassword: entrada.debeCambiarPassword,
      },
      select: SELECT_USUARIO,
    });

    await registrarHistorial(
      {
        tipo: TipoRegistroHistorial.USUARIO,
        entidadId: usuario.id,
        codigo: usuario.email.slice(0, 20),
        estadoNuevo: usuario.activo ? 'ACTIVO' : 'INACTIVO',
        accion: AccionHistorial.CREADO,
        descripcion: `Usuario creado con rol ${rol.nombre}`,
        usuarioId: usuario.id,
      },
      tx,
    );

    return usuario;
  });
};

/**
 * Edición de un usuario por parte del administrador.
 * `usuarioActualId` es quien ejecuta el cambio y queda registrado como autor
 * en el historial; no es el usuario editado.
 */
export const actualizarUsuario = async (
  id: number,
  entrada: ActualizarUsuarioInput,
  usuarioActualId: number,
) => {
  const actual = await prisma.usuario.findUnique({ where: { id }, select: SELECT_USUARIO });
  if (!actual) throw new ErrorNoEncontrado('Usuario');

  if (entrada.email && entrada.email !== actual.email) {
    const dup = await prisma.usuario.findUnique({ where: { email: entrada.email } });
    if (dup) throw new ErrorConflicto('Ese correo electrónico ya está en uso', 'EMAIL_DUPLICADO');
  }

  if (entrada.rolId) {
    const rol = await prisma.rol.findUnique({ where: { id: entrada.rolId } });
    if (!rol) throw new ErrorNoEncontrado('Rol');
    if (!rol.activo) throw new ErrorReglaNegocio('El rol seleccionado no está activo', 'ROL_INACTIVO');
  }

  if (entrada.documento) {
    // El documento es la llave que enlaza al usuario con su repartidor: si se
    // cambia a uno ya usado, el repartidor vería las entregas de otra persona.
    const emparejado = await prisma.repartidor.findUnique({
      where: { documento: entrada.documento },
      select: { id: true },
    });
    if (!emparejado) {
      throw new ErrorReglaNegocio(
        'No existe un repartidor registrado con ese documento. Regístrelo primero o deje el documento vacío.',
        'REPARTIDOR_NO_ENCONTRADO',
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    const usuario = await tx.usuario.update({
      where: { id },
      data: {
        ...(entrada.nombres !== undefined ? { nombres: entrada.nombres } : {}),
        ...(entrada.apellidos !== undefined ? { apellidos: entrada.apellidos } : {}),
        ...(entrada.email !== undefined ? { email: entrada.email } : {}),
        ...(entrada.documento !== undefined ? { documento: entrada.documento } : {}),
        ...(entrada.telefono !== undefined ? { telefono: entrada.telefono } : {}),
        ...(entrada.rolId !== undefined ? { rolId: entrada.rolId } : {}),
        ...(entrada.activo !== undefined ? { activo: entrada.activo } : {}),
        ...(entrada.debeCambiarPassword !== undefined
          ? { debeCambiarPassword: entrada.debeCambiarPassword }
          : {}),
        ...(entrada.nombres !== undefined || entrada.apellidos !== undefined
          ? {
              nombreCompleto: construirNombreCompleto(
                entrada.nombres ?? actual.nombres,
                entrada.apellidos ?? actual.apellidos,
              ),
            }
          : {}),
      },
      select: SELECT_USUARIO,
    });

    await registrarHistorial(
      {
        tipo: TipoRegistroHistorial.USUARIO,
        entidadId: usuario.id,
        codigo: usuario.email.slice(0, 20),
        estadoAnterior: actual.activo ? 'ACTIVO' : 'INACTIVO',
        estadoNuevo: usuario.activo ? 'ACTIVO' : 'INACTIVO',
        accion: AccionHistorial.ACTUALIZADO,
        descripcion: `Datos del usuario ${usuario.nombreCompleto} actualizados`,
        usuarioId: usuarioActualId,
      },
      tx,
    );

    return usuario;
  });
};

export const cambiarEstadoUsuario = async (id: number, activo: boolean, usuarioActualId: number) => {
  if (id === usuarioActualId && !activo) {
    throw new ErrorReglaNegocio('No puede desactivar su propia cuenta', 'AUTODESACTIVACION');
  }
  const usuario = await prisma.usuario.update({
    where: { id },
    data: { activo },
    select: SELECT_USUARIO,
  });
  await registrarHistorial({
    tipo: TipoRegistroHistorial.USUARIO,
    entidadId: id,
    codigo: usuario.email.slice(0, 20),
    estadoNuevo: activo ? 'ACTIVO' : 'INACTIVO',
    accion: activo ? AccionHistorial.ACTUALIZADO : AccionHistorial.ELIMINADO,
    descripcion: activo ? 'Usuario activado' : 'Usuario desactivado',
    usuarioId: usuarioActualId,
  });
  return usuario;
};

export const eliminarUsuario = async (id: number, usuarioActualId: number) => {
  if (id === usuarioActualId) {
    throw new ErrorReglaNegocio('No puede eliminar su propia cuenta', 'AUTOELIMINACION');
  }
  const usuario = await prisma.usuario.update({
    where: { id },
    data: { eliminadoEn: new Date(), activo: false },
    select: SELECT_USUARIO,
  });
  await registrarHistorial({
    tipo: TipoRegistroHistorial.USUARIO,
    entidadId: id,
    codigo: usuario.email.slice(0, 20),
    estadoNuevo: 'ELIMINADO',
    accion: AccionHistorial.ELIMINADO,
    descripcion: 'Usuario eliminado (baja lógica)',
    usuarioId: usuarioActualId,
  });
  return usuario;
};

export const restaurarUsuario = async (id: number, usuarioActualId: number) => {
  const usuario = await prisma.usuario.update({
    where: { id },
    data: { eliminadoEn: null, activo: true },
    select: SELECT_USUARIO,
  });
  await registrarHistorial({
    tipo: TipoRegistroHistorial.USUARIO,
    entidadId: id,
    codigo: usuario.email.slice(0, 20),
    estadoNuevo: 'ACTIVO',
    accion: AccionHistorial.RESTAURADO,
    descripcion: 'Usuario restaurado',
    usuarioId: usuarioActualId,
  });
  return usuario;
};

export const resetearPassword = async (
  id: number,
  passwordNueva: string,
  debeCambiarPassword: boolean,
  usuarioActualId: number,
) => {
  const error = validarFortalezaPassword(passwordNueva);
  if (error) throw new ErrorReglaNegocio(error, 'PASSWORD_DEBIL');

  const usuario = await prisma.usuario.update({
    where: { id },
    data: {
      passwordHash: await hashPassword(passwordNueva),
      debeCambiarPassword,
      intentosFallidos: 0,
      bloqueadoHasta: null,
    },
    select: SELECT_USUARIO,
  });

  await registrarHistorial({
    tipo: TipoRegistroHistorial.USUARIO,
    entidadId: id,
    codigo: usuario.email.slice(0, 20),
    accion: AccionHistorial.ACTUALIZADO,
    descripcion: 'Contraseña restablecida por el administrador',
    usuarioId: usuarioActualId,
  });

  return usuario;
};

export const actualizarPerfil = async (
  id: number,
  datos: { nombres?: string; apellidos?: string; telefono?: string | null; email?: string },
) => {
  const actual = await prisma.usuario.findUnique({ where: { id } });
  if (!actual) throw new ErrorNoEncontrado('Usuario');

  return prisma.usuario.update({
    where: { id },
    data: {
      ...(datos.nombres !== undefined ? { nombres: datos.nombres } : {}),
      ...(datos.apellidos !== undefined ? { apellidos: datos.apellidos } : {}),
      ...(datos.telefono !== undefined ? { telefono: datos.telefono } : {}),
      ...(datos.email !== undefined ? { email: datos.email } : {}),
      ...(datos.nombres !== undefined || datos.apellidos !== undefined
        ? {
            nombreCompleto: construirNombreCompleto(
              datos.nombres ?? actual.nombres,
              datos.apellidos ?? actual.apellidos,
            ),
          }
        : {}),
    },
    select: SELECT_USUARIO,
  });
};

// --- ROLES ----------------------------------------------------------

export const listarRoles = async (filtros: { pagina: number; limite: number; orden: 'asc' | 'desc'; busqueda?: string | null; activo: string }) => {
  const where: Prisma.RolWhereInput = {
    ...(filtros.activo !== 'todos' ? { activo: filtros.activo === 'true' } : {}),
    ...(filtros.busqueda ? { nombre: { contains: filtros.busqueda } } : {}),
  };
  const [total, datos] = await prisma.$transaction([
    prisma.rol.count({ where }),
    prisma.rol.findMany({
      where,
      orderBy: { nombre: filtros.orden },
      skip: (filtros.pagina - 1) * filtros.limite,
      take: filtros.limite,
      include: { _count: { select: { usuarios: { where: { eliminadoEn: null } } } } },
    }),
  ]);
  return construirPaginacion(datos, total, filtros.pagina, filtros.limite);
};

export const crearRol = async (entrada: {
  nombre: string;
  descripcion?: string | null;
  nivel: number;
  activo: boolean;
}) => {
  const existente = await prisma.rol.findUnique({ where: { nombre: entrada.nombre.toUpperCase() } });
  if (existente) throw new ErrorConflicto('Ya existe un rol con ese nombre', 'ROL_DUPLICADO');
  return prisma.rol.create({ data: { ...entrada, nombre: entrada.nombre.toUpperCase() } });
};

export const actualizarRol = async (
  id: number,
  entrada: { nombre?: string; descripcion?: string | null; nivel?: number; activo?: boolean },
) => {
  const rol = await prisma.rol.findUnique({ where: { id } });
  if (!rol) throw new ErrorNoEncontrado('Rol');

  if (entrada.activo === false) {
    const usuariosActivos = await prisma.usuario.count({ where: { rolId: id, activo: true, eliminadoEn: null } });
    if (usuariosActivos > 0) {
      throw new ErrorReglaNegocio(
        `No se puede desactivar el rol porque tiene ${usuariosActivos} usuario(s) activo(s) asignado(s)`,
        'ROL_EN_USO',
      );
    }
  }

  return prisma.rol.update({ where: { id }, data: entrada });
};
