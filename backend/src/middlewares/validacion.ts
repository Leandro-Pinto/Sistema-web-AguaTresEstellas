import type { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';
import { ErrorValidacion } from '../utils/errors';
import { formatearErroresZod } from '../utils/paginacion';

type Fuente = 'body' | 'query' | 'params';

/**
 * Valida y normaliza la entrada con Zod.
 * El resultado validado reemplaza al original, de modo que los servicios
 * reciben siempre datos tipados y saneados (y no hay que volver a convertir).
 */
export const validar = (esquema: ZodSchema, fuente: Fuente = 'body') => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const resultado = esquema.safeParse(req[fuente]);
    if (!resultado.success) {
      next(
        new ErrorValidacion('Los datos enviados no son válidos', formatearErroresZod(resultado.error)),
      );
      return;
    }
    // En algunas versiones de Express, query y params se exponen mediante
    // getters; Object.assign funciona en ambos casos porque son objetos.
    Object.assign(req[fuente], resultado.data);
    next();
  };
};
