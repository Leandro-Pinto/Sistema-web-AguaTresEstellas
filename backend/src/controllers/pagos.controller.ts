import type { Request, Response } from 'express';
import { responder } from '../middlewares/respuesta';
import { asyncHandler } from '../utils/asyncHandler';
import * as pagosService from '../services/pagos.service';
import type { CrearPagoInput, ListarPagosQuery } from '../validators/operaciones.validator';

export const listar = asyncHandler(async (req: Request, res: Response) => {
  const resultado = await pagosService.listarPagos(req.query as unknown as ListarPagosQuery);
  return responder(res, resultado.datos, 'Listado de pagos obtenido', 200, {
    paginacion: resultado.paginacion,
    resumen: resultado.resumen,
  });
});

export const obtener = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const resultado = await pagosService.obtenerPago(Number(id));
  return responder(res, resultado, 'Pago obtenido');
});

export const crear = asyncHandler(async (req: Request, res: Response) => {
  const { pago, totalPagado, saldo } = await pagosService.crearPago(
    req.body as CrearPagoInput,
    req.usuario!.id,
  );
  return responder(
    res,
    { pago, totalPagado, saldo },
    saldo <= 0 ? 'Pago registrado; la venta quedó totalmente cobrada' : 'Pago registrado correctamente',
    201,
  );
});

export const anular = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const { motivo } = req.body as { motivo: string };
  const resultado = await pagosService.anularPago(Number(id), motivo, req.usuario!.id);
  return responder(res, resultado, 'Pago anulado y saldo de la venta recalculado');
});

export const resumenPorMetodo = asyncHandler(async (req: Request, res: Response) => {
  const { fechaInicio, fechaFin } = req.query as unknown as {
    fechaInicio?: string;
    fechaFin?: string;
  };
  const resultado = await pagosService.resumenPorMetodo(
    fechaInicio ? new Date(fechaInicio) : undefined,
    fechaFin ? new Date(fechaFin) : undefined,
  );
  return responder(res, resultado, 'Resumen por método de pago obtenido');
});
