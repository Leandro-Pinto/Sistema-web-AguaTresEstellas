import type { Request, Response } from 'express';
import { responder } from '../middlewares/respuesta';
import { asyncHandler } from '../utils/asyncHandler';
import * as repartidoresService from '../services/repartidores.service';
import * as entregasService from '../services/entregas.service';
import { historialDeEntidad } from '../services/historial.service';
import type {
  ActualizarEntregaInput,
  CrearRepartidorInput,
  ListarEntregasQuery,
  ListarRepartidoresQuery,
  MisEntregasQuery,
  RegistrarEntregaInput,
} from '../validators/operaciones.validator';

// --- Repartidores ---------------------------------------------------

export const listarRepartidores = asyncHandler(async (req: Request, res: Response) => {
  const resultado = await repartidoresService.listarRepartidores(
    req.query as unknown as ListarRepartidoresQuery,
  );
  return responder(res, resultado.datos, 'Listado de repartidores obtenido', 200, {
    paginacion: resultado.paginacion,
  });
});

export const listarRepartidoresActivos = asyncHandler(async (_req: Request, res: Response) => {
  const resultado = await repartidoresService.listarRepartidoresActivos();
  return responder(res, resultado, 'Repartidores activos obtenidos');
});

export const obtenerRepartidor = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const resultado = await repartidoresService.obtenerRepartidor(Number(id));
  return responder(res, resultado, 'Repartidor obtenido');
});

export const crearRepartidor = asyncHandler(async (req: Request, res: Response) => {
  const repartidor = await repartidoresService.crearRepartidor(
    req.body as CrearRepartidorInput,
    req.usuario!.id,
  );
  return responder(res, repartidor, 'Repartidor registrado correctamente', 201);
});

export const actualizarRepartidor = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const repartidor = await repartidoresService.actualizarRepartidor(
    Number(id),
    req.body as Partial<CrearRepartidorInput>,
    req.usuario!.id,
  );
  return responder(res, repartidor, 'Repartidor actualizado correctamente');
});

export const cambiarEstadoRepartidor = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const { activo } = req.body as { activo: boolean };
  const repartidor = await repartidoresService.cambiarEstadoRepartidor(
    Number(id),
    activo,
    req.usuario!.id,
  );
  return responder(res, repartidor, activo ? 'Repartidor activado' : 'Repartidor desactivado');
});

export const eliminarRepartidor = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const repartidor = await repartidoresService.eliminarRepartidor(Number(id), req.usuario!.id);
  return responder(res, repartidor, 'Repartidor eliminado');
});

export const restaurarRepartidor = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const repartidor = await repartidoresService.restaurarRepartidor(Number(id), req.usuario!.id);
  return responder(res, repartidor, 'Repartidor restaurado correctamente');
});

export const zonas = asyncHandler(async (_req: Request, res: Response) => {
  const resultado = await repartidoresService.listarZonas();
  return responder(res, resultado, 'Zonas obtenidas');
});

// --- Entregas -------------------------------------------------------

export const listarEntregas = asyncHandler(async (req: Request, res: Response) => {
  const resultado = await entregasService.listarEntregas(
    req.query as unknown as ListarEntregasQuery,
  );
  return responder(res, resultado.datos, 'Listado de entregas obtenido', 200, {
    paginacion: resultado.paginacion,
  });
});

export const obtenerEntrega = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const resultado = await entregasService.obtenerEntrega(Number(id));
  return responder(res, resultado, 'Entrega obtenida');
});

export const registrarEntrega = asyncHandler(async (req: Request, res: Response) => {
  const entrega = await entregasService.registrarEntrega(
    req.body as RegistrarEntregaInput,
    req.usuario!.id,
  );
  return responder(res, entrega, 'Repartidor asignado correctamente', 201);
});

export const actualizarEntrega = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const entrega = await entregasService.actualizarEntrega(
    Number(id),
    req.body as ActualizarEntregaInput,
    req.usuario!.id,
  );
  return responder(res, entrega, 'Entrega actualizada correctamente');
});

export const misEntregas = asyncHandler(async (req: Request, res: Response) => {
  const repartidor = await entregasService.obtenerRepartidorDeUsuario(req.usuario!.id);
  if (!repartidor) {
    return responder(
      res,
      [],
      'Su usuario no tiene un repartidor asociado. Comuníquese con el administrador.',
    );
  }
  // La ruta ya validó y aplicó los valores por defecto de la paginación.
  const { pagina, limite, estado } = req.query as unknown as MisEntregasQuery;
  const resultado = await entregasService.listarEntregasDeRepartidor(repartidor.id, {
    pagina,
    limite,
    estado,
  });
  return responder(res, resultado.datos, 'Entregas asignadas obtenidas', 200, {
    paginacion: resultado.paginacion,
    repartidor,
  });
});

export const cargaRepartidores = asyncHandler(async (_req: Request, res: Response) => {
  const resultado = await entregasService.cargaPorRepartidor();
  return responder(res, resultado, 'Carga de trabajo por repartidor obtenida');
});

export const historialEntrega = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const resultado = await historialDeEntidad('ENTREGA', Number(id));
  return responder(res, resultado, 'Historial de la entrega obtenido');
});
