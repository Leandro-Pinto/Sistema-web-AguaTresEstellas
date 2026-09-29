import type { Request, Response } from 'express';
import { responder } from '../middlewares/respuesta';
import { asyncHandler } from '../utils/asyncHandler';
import * as pedidosService from '../services/pedidos.service';
import { historialDeEntidad } from '../services/historial.service';
import type {
  ActualizarPedidoInput,
  CrearPedidoInput,
  ListarPedidosQuery,
} from '../validators/pedidos.validator';
import type { EstadoPedido } from '@prisma/client';

export const listar = asyncHandler(async (req: Request, res: Response) => {
  const resultado = await pedidosService.listarPedidos(req.query as unknown as ListarPedidosQuery);
  return responder(res, resultado.datos, 'Listado de pedidos obtenido', 200, {
    paginacion: resultado.paginacion,
  });
});

export const obtener = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const resultado = await pedidosService.obtenerPedido(Number(id));
  return responder(res, resultado, 'Pedido obtenido');
});

export const crear = asyncHandler(async (req: Request, res: Response) => {
  const pedido = await pedidosService.crearPedido(req.body as CrearPedidoInput, req.usuario!.id);
  return responder(res, pedido, 'Pedido registrado correctamente', 201);
});

export const actualizar = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const pedido = await pedidosService.actualizarPedido(
    Number(id),
    req.body as ActualizarPedidoInput,
    req.usuario!.id,
  );
  return responder(res, pedido, 'Pedido actualizado correctamente');
});

export const cambiarEstado = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const { estado, observaciones, motivo } = req.body as {
    estado: EstadoPedido;
    observaciones?: string | null;
    motivo?: string | null;
  };
  const pedido = await pedidosService.cambiarEstadoPedido(
    Number(id),
    estado,
    req.usuario!.id,
    { observaciones, motivo },
  );
  return responder(res, pedido, `Pedido actualizado a estado ${estado}`);
});

export const historial = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const resultado = await historialDeEntidad('PEDIDO', Number(id));
  return responder(res, resultado, 'Historial del pedido obtenido');
});

export const conteoPorEstado = asyncHandler(async (_req: Request, res: Response) => {
  const resultado = await pedidosService.contarPorEstado();
  return responder(res, resultado, 'Conteo por estado obtenido');
});
