import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { verificarTokenAcceso } from '../utils/jwt';
import { ErrorNoAutorizado, ErrorSinPermisos } from '../utils/errors';

const extraerToken = (req: Request): string | null => {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7);
  return null;
};

/**
 * Verifica el JWT y carga el usuario desde la base de datos.
 * No se confía en los datos del token: el rol vigente se lee de la BD,
 * de modo que desactivar un usuario surte efecto en la siguiente petición.
 */
export const autenticar = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const token = extraerToken(req);
    if (!token) throw new ErrorNoAutorizado('Debe iniciar sesión para acceder');

    const payload = verificarTokenAcceso(token);

    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        nombreCompleto: true,
        activo: true,
        eliminadoEn: true,
        rol: { select: { id: true, nombre: true, nivel: true, activo: true } },
      },
    });

    if (!usuario || !usuario.activo || usuario.eliminadoEn) {
      throw new ErrorNoAutorizado('El usuario está inactivo o fue eliminado');
    }
    if (!usuario.rol.activo) {
      throw new ErrorNoAutorizado('El rol asignado no está activo');
    }

    req.usuario = {
      id: usuario.id,
      email: usuario.email,
      nombre: usuario.nombreCompleto,
      rol: usuario.rol.nombre,
      rolId: usuario.rol.id,
    };
    next();
  } catch (e) {
    next(e);
  }
};

/**
 * Autorización por rol. La seguridad efectiva está aquí, en el backend:
 * la interfaz solo oculta botones, no protege datos.
 */
export const autorizar = (...rolesPermitidos: string[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.usuario) {
      next(new ErrorNoAutorizado());
      return;
    }
    if (rolesPermitidos.length > 0 && !rolesPermitidos.includes(req.usuario.rol)) {
      next(
        new ErrorSinPermisos(
          `Su rol (${req.usuario.rol}) no tiene permiso para esta operación`,
        ),
      );
      return;
    }
    next();
  };
};
