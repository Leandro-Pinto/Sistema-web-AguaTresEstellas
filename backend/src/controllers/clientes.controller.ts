import type { Request, Response } from 'express';
import { responder } from '../middlewares/respuesta';
import { asyncHandler } from '../utils/asyncHandler';
import * as clientesService from '../services/clientes.service';
import type {
  ActualizarClienteInput,
  CrearClienteInput,
  ListarClientesQuery,
} from '../validators/clientes.validator';

export const listar = asyncHandler(async (req: Request, res: Response) => {
  const resultado = await clientesService.listarClientes(req.query as unknown as ListarClientesQuery);
  return responder(res, resultado.datos, 'Listado de clientes obtenido', 200, {
    paginacion: resultado.paginacion,
  });
});

export const obtener = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const resultado = await clientesService.obtenerFichaCliente(Number(id));
  return responder(res, resultado, 'Cliente obtenido');
});

export const crear = asyncHandler(async (req: Request, res: Response) => {
  const cliente = await clientesService.crearCliente(req.body as CrearClienteInput, req.usuario!.id);
  return responder(res, cliente, 'Cliente registrado correctamente', 201);
});

export const actualizar = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const cliente = await clientesService.actualizarCliente(
    Number(id),
    req.body as ActualizarClienteInput,
    req.usuario!.id,
  );
  return responder(res, cliente, 'Cliente actualizado correctamente');
});

export const cambiarEstado = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const { activo } = req.body as { activo: boolean };
  const cliente = await clientesService.cambiarEstadoCliente(Number(id), activo, req.usuario!.id);
  return responder(res, cliente, activo ? 'Cliente activado' : 'Cliente desactivado');
});

export const eliminar = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const cliente = await clientesService.eliminarCliente(Number(id), req.usuario!.id);
  return responder(res, cliente, 'Cliente eliminado');
});

export const restaurar = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const cliente = await clientesService.restaurarCliente(Number(id), req.usuario!.id);
  return responder(res, cliente, 'Cliente restaurado correctamente');
});

export const buscar = asyncHandler(async (req: Request, res: Response) => {
  const { q, limite } = req.query as unknown as { q?: string; limite?: string };
  const resultado = await clientesService.buscarClientesRapido(q ?? '', limite ? Number(limite) : 10);
  return responder(res, resultado, 'Búsqueda completada');
});

export const distritos = asyncHandler(async (_req: Request, res: Response) => {
  const resultado = await clientesService.listarDistritos();
  return responder(res, resultado, 'Distritos obtenidos');
});
