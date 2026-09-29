import type { Request } from 'express';
import { ErrorValidacion } from './errors';

export interface ResultadoPaginacion<T> {
  datos: T[];
  paginacion: {
    pagina: number;
    limite: number;
    total: number;
    totalPaginas: number;
    tieneSiguiente: boolean;
    tieneAnterior: boolean;
  };
}

export const normalizarPaginacion = (query: Request['query']) => {
  const pagina = Math.max(1, Number(query.pagina ?? 1) || 1);
  const limiteBruto = Number(query.limite ?? 10) || 10;
  const limite = Math.min(100, Math.max(1, limiteBruto));
  return { pagina, limite, skip: (pagina - 1) * limite };
};

export const construirPaginacion = <T>(
  datos: T[],
  total: number,
  pagina: number,
  limite: number,
): ResultadoPaginacion<T> => ({
  datos,
  paginacion: {
    pagina,
    limite,
    total,
    totalPaginas: Math.max(1, Math.ceil(total / limite)),
    tieneSiguiente: pagina * limite < total,
    tieneAnterior: pagina > 1,
  },
});

/**
 * Convierte los mensajes de Zod a un formato comprensible para el personal
 * de la empresa, que no domina lenguaje técnico.
 */
export const formatearErroresZod = (error: unknown): unknown[] => {
  const issues = (error as { issues?: { path: (string | number)[]; message: string }[] })?.issues;
  if (!issues) return [];
  return issues.map((i) => ({
    campo: i.path.join('.'),
    mensaje: i.message,
  }));
};

export const validarEsquema = <T>(esquema: { safeParse: (d: unknown) => { success: boolean; data?: T; error?: unknown } }, datos: unknown): T => {
  const resultado = esquema.safeParse(datos);
  if (!resultado.success) {
    throw new ErrorValidacion('Los datos enviados no son válidos', formatearErroresZod(resultado.error));
  }
  return resultado.data as T;
};
