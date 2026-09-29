import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/prisma';

/**
 * Mide el tiempo de las consultas de solo lectura que exigen la tesis
 * ("tiempo promedio para obtener el consolidado diario de ventas" y
 * "tiempo promedio de consulta del historial de envases").
 *
 * El servicio de reportes pasa por `marcarConsulta` y el dato queda
 * disponible para el módulo de indicadores.
 */
export const registrarConsulta = async (
  tipoConsulta: string,
  descripcion: string,
  duracionMs: number,
  registros: number,
  usuarioId: number | null,
): Promise<void> => {
  try {
    await prisma.logConsulta.create({
      data: { tipoConsulta, descripcion, duracionMs, registros, usuarioId },
    });
  } catch {
    // Instrumental: no debe romper la consulta del usuario.
  }
};

/**
 * Ejecuta una función midiendo su duración y registrándola.
 * La duración se mide con el reloj de alta resolución, de modo que el valor
 * sea atribuible a la consulta y no al tiempo de escritura en la base.
 */
export const medirConsulta = async <T>(
  tipoConsulta: string,
  descripcion: string,
  usuarioId: number | null,
  fn: () => Promise<T>,
  contarRegistros: (resultado: T) => number = (r) => (Array.isArray(r) ? r.length : 1),
): Promise<T> => {
  const inicio = process.hrtime.bigint();
  const resultado = await fn();
  const duracionMs = Number((process.hrtime.bigint() - inicio) / 1_000_000n);
  await registrarConsulta(tipoConsulta, descripcion, duracionMs, contarRegistros(resultado), usuarioId);
  return resultado;
};

export const consultaEnviada = (req: Request, _res: Response, next: NextFunction): void => {
  next();
};
