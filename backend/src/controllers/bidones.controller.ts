import type { Request, Response } from 'express';
import { responder } from '../middlewares/respuesta';
import { asyncHandler } from '../utils/asyncHandler';
import * as bidonesService from '../services/bidones.service';
import * as reportesService from '../services/reportes.service';
import { origenSolicitado } from '../services/origen-dato';
import {
  listarSaldosBidonesSchema,
  type ListarMovimientosBidonQuery,
  type ListarSaldosBidonesQuery,
  type MovimientoBidonInput,
} from '../validators/operaciones.validator';
import type { z } from 'zod';

/** Origen pedido en la query, sin validar: lo valida `origenSolicitado`. */
const origenPedido = (req: Request): string | undefined =>
  (req.query as unknown as { origen?: string }).origen;

export const saldoCliente = asyncHandler(async (req: Request, res: Response) => {
  const { clienteId } = req.params as unknown as { clienteId: string };
  const { productoId } = req.query as unknown as { productoId?: string };
  const resultado = await bidonesService.calcularSaldoBidones(
    Number(clienteId),
    productoId ? Number(productoId) : undefined,
  );
  return responder(res, resultado, 'Saldo de bidones obtenido');
});

export const saldos = asyncHandler(async (req: Request, res: Response) => {
  const resultado = await bidonesService.listarSaldosBidones(
    req.query as unknown as z.infer<typeof listarSaldosBidonesSchema>,
  );  return responder(res, resultado.datos, 'Saldos de bidones obtenidos', 200, {
    paginacion: resultado.paginacion,
    totalBidones: await bidonesService.saldoTotalBidones(),
  });
});

export const saldoTotal = asyncHandler(async (_req: Request, res: Response) => {
  const total = await bidonesService.saldoTotalBidones();
  return responder(res, { totalBidones: total }, 'Saldo total de bidones obtenido');
});

export const registrarMovimiento = asyncHandler(async (req: Request, res: Response) => {
  const movimiento = await bidonesService.registrarMovimientoBidon(
    req.body as MovimientoBidonInput,
    req.usuario!.id,
  );
  return responder(res, movimiento, 'Movimiento de bidones registrado correctamente', 201);
});

export const listarMovimientos = asyncHandler(async (req: Request, res: Response) => {
  const resultado = await bidonesService.listarMovimientosBidon(
    req.query as unknown as ListarMovimientosBidonQuery,
  );
  return responder(res, resultado.datos, 'Movimientos de bidones obtenidos', 200, {
    paginacion: resultado.paginacion,
  });
});

export const historialCliente = asyncHandler(async (req: Request, res: Response) => {
  const { clienteId } = req.params as unknown as { clienteId: string };
  const { productoId } = req.query as unknown as { productoId?: string };
  const { origen, nota } = origenSolicitado(origenPedido(req));
  const resultado = await reportesService.consultaHistorialBidones(
    Number(clienteId),
    req.usuario!.id,
    productoId ? Number(productoId) : undefined,
    origen,
  );
  return responder(
    res,
    resultado,
    `Historial de bidones del cliente obtenido${nota ? `. ${nota}` : ''}`,
  );
});

export const listarHistorial = asyncHandler(async (req: Request, res: Response) => {
  const { clienteId, productoId } = req.params as unknown as {
    clienteId: string;
    productoId?: string;
  };
  const { origen, nota } = origenSolicitado(origenPedido(req));
  const resultado = await bidonesService.historialBidonesCliente(
    Number(clienteId),
    productoId ? Number(productoId) : undefined,
    origen,
  );
  return responder(res, resultado, `Historial de bidones obtenido${nota ? `. ${nota}` : ''}`);
});
