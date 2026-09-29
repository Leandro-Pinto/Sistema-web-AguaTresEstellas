import type { Request, Response, NextFunction } from 'express';

/**
 * Envuelve un handler asíncrono para que los rechazos lleguen al
 * middleware de errores en lugar de quedar como promesas no capturadas.
 */
export const asyncHandler =
  <T>(fn: (req: Request, res: Response, next: NextFunction) => Promise<T>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
