import type { Request, Response } from 'express';
import { responder } from '../middlewares/respuesta';
import { asyncHandler } from '../utils/asyncHandler';
import * as dashboardService from '../services/dashboard.service';
import * as bidonesService from '../services/bidones.service';

export const resumen = asyncHandler(async (_req: Request, res: Response) => {
  const resultado = await dashboardService.obtenerDashboard();
  return responder(res, resultado, 'Resumen del tablero obtenido');
});

export const indicadoresProceso = asyncHandler(async (_req: Request, res: Response) => {
  const resultado = await dashboardService.obtenerIndicadoresProceso();
  return responder(res, resultado, 'Indicadores del proceso obtenidos');
});

export const seriesVentas = asyncHandler(async (req: Request, res: Response) => {
  const { dias } = req.query as unknown as { dias?: string };
  const resultado = await dashboardService.obtenerSeriesVentas(dias ? Number(dias) : 14);
  return responder(res, resultado, 'Series de ventas obtenidas');
});

export const productosMasVendidos = asyncHandler(async (req: Request, res: Response) => {
  const { dias } = req.query as unknown as { dias?: string };
  const resultado = await dashboardService.obtenerProductosMasVendidos(dias ? Number(dias) : 30);
  return responder(res, resultado, 'Productos más vendidos obtenidos');
});

/** Saldos de bidones por cliente: alimenta la alerta de envases pendientes. */
export const alertasBidones = asyncHandler(async (_req: Request, res: Response) => {
  const resultado = await bidonesService.listarSaldosBidones({
    pagina: 1,
    limite: 10,
    orden: 'desc',
    soloConSaldo: true,
  } as never);
  return responder(res, resultado.datos, 'Clientes con bidones pendientes obtenidos', 200, {
    paginacion: resultado.paginacion,
  });
});
