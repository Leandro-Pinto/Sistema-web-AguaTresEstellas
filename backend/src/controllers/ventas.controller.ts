import type { Request, Response } from 'express';
import { responder } from '../middlewares/respuesta';
import { asyncHandler } from '../utils/asyncHandler';
import * as ventasService from '../services/ventas.service';
import { historialDeEntidad } from '../services/historial.service';
import type { CrearVentaInput, ListarVentasQuery } from '../validators/operaciones.validator';

export const listar = asyncHandler(async (req: Request, res: Response) => {
  const resultado = await ventasService.listarVentas(req.query as unknown as ListarVentasQuery);
  return responder(res, resultado.datos, 'Listado de ventas obtenido', 200, {
    paginacion: resultado.paginacion,
  });
});

export const obtener = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const resultado = await ventasService.obtenerVenta(Number(id));
  return responder(res, resultado, 'Venta obtenida');
});

export const crear = asyncHandler(async (req: Request, res: Response) => {
  const venta = await ventasService.crearVenta(req.body as CrearVentaInput, req.usuario!.id);
  return responder(res, venta, 'Venta registrada correctamente', 201);
});

export const anular = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const { motivo, reponerInventario } = req.body as { motivo: string; reponerInventario: boolean };
  const venta = await ventasService.anularVenta(
    Number(id),
    motivo,
    reponerInventario,
    req.usuario!.id,
  );
  return responder(res, venta, 'Venta anulada y reposición de inventario aplicada');
});

export const emitirConstancia = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const venta = await ventasService.emitirConstancia(Number(id), req.usuario!.id);
  return responder(res, venta, `Constancia ${venta.constanciaCodigo} emitida correctamente`);
});

export const constancia = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const resultado = await ventasService.obtenerConstancia(Number(id));
  return responder(res, resultado, 'Datos de la constancia obtenidos');
});

export const historial = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const resultado = await historialDeEntidad('VENTA', Number(id));
  return responder(res, resultado, 'Historial de la venta obtenido');
});
