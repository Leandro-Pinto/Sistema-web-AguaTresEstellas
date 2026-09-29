import type { Request, Response } from 'express';
import { responder } from '../middlewares/respuesta';
import { asyncHandler } from '../utils/asyncHandler';
import {
  PRETEST_BASE,
  compararPretestPostest,
  exportarIndicadores,
  indicadoresProcesoVentas,
  indicadoresSistemaWeb,
  type ParametrosPretest,
} from '../services/indicadores.service';
import { rangoPorDefecto, resolverRango } from '../utils/fechas';
import { responderCsv } from '../utils/exportar';

/**
 * INDICADORES DE LA TESIS
 *
 * Expone los tres bloques que alimentan las tablas de resultados:
 *   - proceso: eficiencia y tiempos del circuito de venta (variable dependiente)
 *   - sistema: adecuación, eficiencia y fiabilidad (variable independiente)
 *   - comparativo: pretest contra postest, con variación absoluta y porcentual
 */

/** Lee el rango pedido; sin parámetros devuelve undefined para que el
 *  servicio use "todo el histórico", que es lo útil durante las pruebas. */
const rangoOpcional = (req: Request): [Date?, Date?] => {
  const { fechaInicio, fechaFin } = req.query as unknown as {
    fechaInicio?: string;
    fechaFin?: string;
  };
  if (!fechaInicio && !fechaFin) return [];
  const rango = resolverRango(fechaInicio, fechaFin);
  return [rango.fechaInicio, rango.fechaFin];
};

/** Lee una línea base de pretest enviada por el cliente (opcional). */
const pretestDesde = (req: Request): ParametrosPretest => {
  const { pretest } = req.body as { pretest?: ParametrosPretest };
  return pretest ? { ...PRETEST_BASE, ...pretest } : PRETEST_BASE;
};

export const proceso = asyncHandler(async (req: Request, res: Response) => {
  const [fechaInicio, fechaFin] = rangoOpcional(req);
  const resultado = await indicadoresProcesoVentas(fechaInicio, fechaFin);
  return responder(res, resultado, 'Indicadores del proceso de ventas obtenidos');
});

export const sistema = asyncHandler(async (req: Request, res: Response) => {
  const [fechaInicio, fechaFin] = rangoOpcional(req);
  const resultado = await indicadoresSistemaWeb(fechaInicio, fechaFin);
  return responder(res, resultado, 'Indicadores del sistema web obtenidos');
});

/** Comparativa pretest/postest. Acepta POST para poder adjuntar la ficha. */
export const comparativo = asyncHandler(async (req: Request, res: Response) => {
  const [fechaInicio, fechaFin] = rangoOpcional(req);
  const resultado = await compararPretestPostest(pretestDesde(req), fechaInicio, fechaFin);
  return responder(res, resultado, 'Comparativa pretest/postest generada');
});

/** Línea base del pretest tal como está configurada, sin calcular postest. */
export const pretest = asyncHandler(async (_req: Request, res: Response) =>
  responder(res, PRETEST_BASE, 'Línea base del pretest obtenida'),
);

/** Período evaluado por defecto: los últimos 30 días. */
export const periodo = asyncHandler(async (_req: Request, res: Response) =>
  responder(res, rangoPorDefecto(30), 'Período de evaluación por defecto obtenido'),
);

export const exportar = asyncHandler(async (req: Request, res: Response) => {
  const [fechaInicio, fechaFin] = rangoOpcional(req);
  const contenido = await exportarIndicadores(fechaInicio, fechaFin);
  return responderCsv(res, 'indicadores_tesis', contenido);
});
