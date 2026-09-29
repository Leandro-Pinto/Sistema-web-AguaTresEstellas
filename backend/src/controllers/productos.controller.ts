import type { Request, Response } from 'express';
import { responder } from '../middlewares/respuesta';
import { asyncHandler } from '../utils/asyncHandler';
import * as productosService from '../services/productos.service';
import * as inventarioService from '../services/inventario.service';
import {
  listarMovimientosInventarioSchema,
  listarProductosSchema,
  type ActualizarProductoInput,
  type CrearProductoInput,
  type MovimientoInventarioInput,
} from '../validators/productosInventario.validator';
import type { z } from 'zod';

export const listar = asyncHandler(async (req: Request, res: Response) => {
  const resultado = await productosService.listarProductos(
    req.query as unknown as z.infer<typeof listarProductosSchema>,
  );
  return responder(res, resultado.datos, 'Listado de productos obtenido', 200, {
    paginacion: resultado.paginacion,
  });
});

export const listarActivos = asyncHandler(async (_req: Request, res: Response) => {
  const resultado = await productosService.listarProductosActivos();
  return responder(res, resultado, 'Productos activos obtenidos');
});

export const obtener = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const resultado = await productosService.obtenerProducto(Number(id));
  return responder(res, resultado, 'Producto obtenido');
});

export const crear = asyncHandler(async (req: Request, res: Response) => {
  const producto = await productosService.crearProducto(
    req.body as CrearProductoInput,
    req.usuario!.id,
  );
  return responder(res, producto, 'Producto registrado correctamente', 201);
});

export const actualizar = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const producto = await productosService.actualizarProducto(
    Number(id),
    req.body as ActualizarProductoInput,
    req.usuario!.id,
  );
  return responder(res, producto, 'Producto actualizado correctamente');
});

export const cambiarEstado = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const { activo } = req.body as { activo: boolean };
  const producto = await productosService.cambiarEstadoProducto(
    Number(id),
    activo,
    req.usuario!.id,
  );
  return responder(res, producto, activo ? 'Producto activado' : 'Producto desactivado');
});

export const eliminar = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const producto = await productosService.eliminarProducto(Number(id), req.usuario!.id);
  return responder(res, producto, 'Producto eliminado');
});

export const restaurar = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const producto = await productosService.restaurarProducto(Number(id), req.usuario!.id);
  return responder(res, producto, 'Producto restaurado correctamente');
});

// --- Inventario ------------------------------------------------------

export const verInventario = asyncHandler(async (_req: Request, res: Response) => {
  const resultado = await inventarioService.obtenerInventario();
  return responder(res, resultado, 'Inventario obtenido');
});

export const registrarMovimiento = asyncHandler(async (req: Request, res: Response) => {
  const movimiento = await inventarioService.registrarMovimientoManual(
    req.body as MovimientoInventarioInput,
    req.usuario!.id,
  );
  return responder(
    res,
    movimiento,
    'Movimiento de inventario registrado; el stock fue actualizado',
    201,
  );
});

export const listarMovimientos = asyncHandler(async (req: Request, res: Response) => {
  const resultado = await inventarioService.listarMovimientosInventario(
    req.query as unknown as z.infer<typeof listarMovimientosInventarioSchema>,
  );
  return responder(res, resultado.datos, 'Movimientos obtenidos', 200, {
    paginacion: resultado.paginacion,
  });
});

export const obtenerMovimiento = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const resultado = await inventarioService.obtenerMovimiento(Number(id));
  return responder(res, resultado, 'Movimiento obtenido');
});
