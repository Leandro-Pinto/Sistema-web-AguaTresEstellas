import type { NextFunction, Request, Response } from 'express';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: {
        id: number;
        email: string;
        nombre: string;
        rol: string;
        rolId: number;
      };
      /// Instante de llegada en nanosegundos monótonos: inmune a ajustes del
      /// reloj del sistema, a diferencia de Date.now().
      tiempoInicio?: bigint;
    }
  }
}

/**
 * Normaliza el resultado de la bitácora HTTP para que el frontend siempre
 * reciba la misma envoltura: { mensaje, datos, meta? }.
 */
export const responder = (
  res: Response,
  datos: unknown,
  mensaje = 'Operación realizada correctamente',
  status = 200,
  meta?: Record<string, unknown>,
): Response => {
  const cuerpo: Record<string, unknown> = { exito: true, mensaje, datos };
  if (meta) cuerpo.meta = meta;
  return res.status(status).json(cuerpo);
};

/**
 * Marca el instante de llegada de la petición. Lo usa el middleware de
 * bitácora para calcular el tiempo de respuesta (indicador de la
 * variable independiente "eficiencia del desempeño").
 */
export const marcarTiempo = (req: Request, _res: Response, next: NextFunction): void => {
  req.tiempoInicio = process.hrtime.bigint();
  next();
};
