import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/prisma';

/**
 * Bitácora de peticiones HTTP.
 *
 * Escala técnica: se ejecuta después de la respuesta y nunca bloquea al
 * cliente. Sus datos alimentan los indicadores de la variable independiente
 * "Sistema web":
 *   - Eficiencia: tiempo de respuesta (mediana, p95), transacciones por minuto
 *   - Fiabilidad: porcentaje de solicitudes fallidas (5xx)
 */
const registrarPeticion = async (
  metodo: string,
  ruta: string,
  status: number,
  duracionMs: number,
  usuarioId: number | null,
  ip: string | null,
  registros: number | null,
): Promise<void> => {
  try {
    await prisma.bitacoraHttp.create({
      data: {
        metodo,
        ruta,
        status,
        duracionMs,
        esErrorServidor: status >= 500,
        usuarioId,
        ip,
        registros,
      },
    });
  } catch {
    // La bitácora es instrumental: si falla, no debe afectar la operación.
  }
};

export const bitacoraHttp = (req: Request, res: Response, next: NextFunction): void => {
  res.on('finish', () => {
    if (req.path === '/salud' || req.path === '/health') return;
    const inicio = req.tiempoInicio ?? process.hrtime.bigint();
    const duracionMs = Number((process.hrtime.bigint() - inicio) / 1_000_000n);
    const cuerpo = res.locals?.datos as unknown;
    const registros = Array.isArray(cuerpo)
      ? cuerpo.length
      : cuerpo && typeof cuerpo === 'object' && Array.isArray((cuerpo as Record<string, unknown>).datos)
        ? ((cuerpo as Record<string, unknown>).datos as unknown[]).length
        : null;

    void registrarPeticion(
      req.method,
      req.route?.path ? `${req.baseUrl}${req.route.path}` : req.originalUrl.split('?')[0],
      res.statusCode,
      duracionMs,
      req.usuario?.id ?? null,
      req.ip ?? null,
      registros,
    );
  });
  next();
};
