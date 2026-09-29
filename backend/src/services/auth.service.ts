import { prisma, config } from '../config';
import { AppError, ErrorNoAutorizado } from '../utils/errors';
import { compararPassword } from '../utils/password';
import { firmarTokenAcceso, firmarTokenRefresh } from '../utils/jwt';
import { registrarHistorial } from './historial.service';
import { AccionHistorial, TipoRegistroHistorial } from '@prisma/client';
import type { LoginInput } from '../validators/auth.validator';

const SELECT_PERFIL = {
  id: true,
  nombres: true,
  apellidos: true,
  nombreCompleto: true,
  email: true,
  telefono: true,
  activo: true,
  ultimoAcceso: true,
  debeCambiarPassword: true,
  rol: { select: { id: true, nombre: true, nivel: true } },
} as const;

/**
 * Inicio de sesión.
 *
 * Medidas de seguridad aplicadas:
 *  - La contraseña se compara contra el hash bcrypt (nunca se almacena en claro).
 *  - Tras 5 intentos fallidos la cuenta se bloquea temporalmente.
 *  - El último acceso y su IP quedan registrados.
 *  - Se emiten dos tokens: uno de acceso corto y uno de renovación.
 */
export const iniciarSesion = async (entrada: LoginInput, ip: string | null) => {
  const email = entrada.email.toLowerCase();

  const usuario = await prisma.usuario.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      activo: true,
      eliminadoEn: true,
      intentosFallidos: true,
      bloqueadoHasta: true,
      nombreCompleto: true,
      debeCambiarPassword: true,
      rol: { select: { id: true, nombre: true, nivel: true, activo: true } },
    },
  });

  if (!usuario) {
    // Mensaje genérico: no se revela si el correo existe.
    throw new ErrorNoAutorizado('Correo o contraseña incorrectos');
  }

  if (usuario.bloqueadoHasta && usuario.bloqueadoHasta > new Date()) {
    const minutos = Math.ceil((usuario.bloqueadoHasta.getTime() - Date.now()) / 60000);
    throw new AppError(
      `Cuenta bloqueada por intentos fallidos. Intente nuevamente en ${minutos} minuto(s).`,
      423,
      'CUENTA_BLOQUEADA',
    );
  }

  if (!usuario.activo || usuario.eliminadoEn) {
    throw new ErrorNoAutorizado('El usuario está inactivo. Comuníquese con el administrador.');
  }

  if (!usuario.rol.activo) {
    throw new ErrorNoAutorizado('El rol asignado no está activo. Comuníquese con el administrador.');
  }

  const passwordValida = await compararPassword(entrada.password, usuario.passwordHash);

  if (!passwordValida) {
    const intentos = usuario.intentosFallidos + 1;
    const debeBloquear = intentos >= config.maxIntentosLogin;
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        intentosFallidos: intentos,
        ...(debeBloquear
          ? {
              bloqueadoHasta: new Date(Date.now() + config.minutosBloqueoLogin * 60_000),
              intentosFallidos: 0,
            }
          : {}),
      },
    });
    if (debeBloquear) {
      throw new AppError(
        `Cuenta bloqueada por ${config.maxIntentosLogin} intentos fallidos. Intente en ${config.minutosBloqueoLogin} minutos.`,
        423,
        'CUENTA_BLOQUEADA',
      );
    }
    throw new ErrorNoAutorizado('Correo o contraseña incorrectos');
  }

  const payload = {
    sub: usuario.id,
    email: usuario.email,
    rol: usuario.rol.nombre,
    rolId: usuario.rol.id,
    nombre: usuario.nombreCompleto,
  };

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { ultimoAcceso: new Date(), ultimoAccesoIp: ip, intentosFallidos: 0, bloqueadoHasta: null },
  });

  await registrarHistorial({
    tipo: TipoRegistroHistorial.USUARIO,
    entidadId: usuario.id,
    codigo: usuario.email.slice(0, 20),
    accion: AccionHistorial.INICIO_SESION,
    descripcion: `Inicio de sesión (${usuario.rol.nombre})`,
    usuarioId: usuario.id,
  });

  const duracionAcceso = entrada.recordar ? '30d' : config.jwt.expiresIn;
  return {
    tokenAcceso: firmarTokenAcceso(payload),
    tokenRefresh: firmarTokenRefresh({ sub: usuario.id }),
    expiraEn: duracionAcceso,
    usuario: {
      id: usuario.id,
      nombreCompleto: usuario.nombreCompleto,
      email: usuario.email,
      rol: usuario.rol.nombre,
      debeCambiarPassword: usuario.debeCambiarPassword,
    },
  };
};

export const renovarToken = async (refreshToken: string) => {
  const { verificarTokenRefresh } = await import('../utils/jwt');
  const usuarioId = verificarTokenRefresh(refreshToken);

  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: {
      id: true,
      email: true,
      nombreCompleto: true,
      activo: true,
      eliminadoEn: true,
      rol: { select: { id: true, nombre: true, activo: true } },
    },
  });

  if (!usuario || !usuario.activo || usuario.eliminadoEn || !usuario.rol.activo) {
    throw new ErrorNoAutorizado('La sesión ya no es válida');
  }

  return {
    tokenAcceso: firmarTokenAcceso({
      sub: usuario.id,
      email: usuario.email,
      rol: usuario.rol.nombre,
      rolId: usuario.rol.id,
      nombre: usuario.nombreCompleto,
    }),
  };
};

export const cerrarSesion = async (usuarioId: number) => {
  await registrarHistorial({
    tipo: TipoRegistroHistorial.USUARIO,
    entidadId: usuarioId,
    accion: AccionHistorial.CIERRE_SESION,
    descripcion: 'Cierre de sesión',
    usuarioId,
  });
};

export const obtenerPerfil = async (usuarioId: number) => {
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: SELECT_PERFIL });
  if (!usuario) throw new ErrorNoAutorizado('Usuario no encontrado');
  return usuario;
};

export const cambiarPasswordPropio = async (
  usuarioId: number,
  passwordActual: string,
  passwordNueva: string,
) => {
  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: { id: true, passwordHash: true },
  });
  if (!usuario) throw new ErrorNoAutorizado('Usuario no encontrado');

  const actualValida = await compararPassword(passwordActual, usuario.passwordHash);
  if (!actualValida) throw new ErrorNoAutorizado('La contraseña actual no es correcta');

  const { hashPassword } = await import('../utils/password');
  await prisma.usuario.update({
    where: { id: usuarioId },
    data: { passwordHash: await hashPassword(passwordNueva), debeCambiarPassword: false },
  });

  await registrarHistorial({
    tipo: TipoRegistroHistorial.USUARIO,
    entidadId: usuarioId,
    accion: AccionHistorial.ACTUALIZADO,
    descripcion: 'Contraseña actualizada por el propio usuario',
    usuarioId,
  });

  return { mensaje: 'Contraseña actualizada correctamente' };
};
