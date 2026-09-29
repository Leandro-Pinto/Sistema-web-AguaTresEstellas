import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { AppError, ErrorValidacion } from '../utils/errors';
import { config } from '../config/env';
import { logger } from '../utils/logger';

export const noEncontrado = (req: Request, _res: Response, next: NextFunction): void => {
  next(new AppError(`La ruta ${req.method} ${req.originalUrl} no existe`, 404, 'RUTA_NO_ENCONTRADA'));
};

/**
 * Manejador central de errores.
 * Reglas:
 *  - Los AppError conservan su status y código de negocio.
 *  - Los errores de Prisma se traducen a mensajes comprensibles.
 *  - Nunca se filtra el stack al cliente en producción.
 */
export const manejadorErrores = (
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void => {
  let status = 500;
  let codigo = 'ERROR_INTERNO';
  let mensaje = 'Ocurrió un error interno en el servidor';
  let detalles: unknown;

  if (err instanceof AppError) {
    status = err.statusCode;
    codigo = err.codigo;
    mensaje = err.message;
    detalles = err.detalles;
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': {
        status = 409;
        codigo = 'DUPLICADO';
        const destino = (err.meta?.target as string[] | undefined)?.join(', ') ?? 'campo';
        mensaje = `Ya existe un registro con el mismo valor en: ${destino}`;
        break;
      }
      case 'P2003':
        status = 409;
        codigo = 'REFERENCIA_INVALIDA';
        mensaje = 'La operación afecta registros relacionados. Revise las dependencias.';
        break;
      case 'P2025':
        status = 404;
        codigo = 'NO_ENCONTRADO';
        mensaje = 'El registro solicitado no existe';
        break;
      default:
        status = 400;
        codigo = `PRISMA_${err.code}`;
        mensaje = 'No se pudo completar la operación sobre la base de datos';
    }
    detalles = config.env === 'development' ? err.message : undefined;
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    status = 422;
    codigo = 'VALIDACION';
    mensaje = 'Los datos enviados no son válidos';
    detalles = config.env === 'development' ? err.message : undefined;
  } else if (err instanceof SyntaxError && 'body' in err) {
    status = 400;
    codigo = 'JSON_INVALIDO';
    mensaje = 'El cuerpo de la petición no es un JSON válido';
  } else if (err instanceof ErrorValidacion) {
    status = err.statusCode;
    codigo = err.codigo;
    mensaje = err.message;
    detalles = err.detalles;
  }

  if (status >= 500) {
    logger.error('Error no controlado', {
      mensaje: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
  }

  res.status(status).json({
    exito: false,
    mensaje,
    codigo,
    ...(detalles ? { detalles } : {}),
    ...(config.env === 'development' && err instanceof Error && status >= 500
      ? { stack: err.stack }
      : {}),
  });
};
