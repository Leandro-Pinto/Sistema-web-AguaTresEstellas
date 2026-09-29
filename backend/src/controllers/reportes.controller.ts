import type { Request, Response } from 'express';
import { responder } from '../middlewares/respuesta';
import { asyncHandler } from '../utils/asyncHandler';
import * as reportesService from '../services/reportes.service';
import { normalizarFecha, rangoPorDefecto, resolverRango } from '../utils/fechas';
import { responderCsv } from '../utils/exportar';
import { prisma } from '../config/prisma';
import type { MetodoPago } from '@prisma/client';

/** Rango de fechas pedido en la query; por defecto, los últimos 30 días. */
const rangoDesde = (req: Request): reportesService.RangoFechas => {
  const { fechaInicio, fechaFin } = req.query as unknown as {
    fechaInicio?: string;
    fechaFin?: string;
  };
  if (fechaInicio || fechaFin) return resolverRango(fechaInicio, fechaFin);
  return rangoPorDefecto(30);
};

const entero = (valor?: string): number | undefined =>
  valor === undefined ? undefined : Number(valor);

/**
 * Genera el reporte y responde en JSON o como descarga CSV según `formato`.
 * Todos los reportes comparten esta lógica para que la vista de la aplicación
 * y la exportación tengan exactamente los mismos datos.
 */
const entregarReporte = async (
  req: Request,
  res: Response,
  nombre: string,
  ejecutar: () => Promise<unknown>,
) => {
  const { formato } = req.query as unknown as { formato?: string };
  const contenido = await ejecutar();
  if (formato === 'csv' || formato === 'excel') {
    return responderCsv(res, nombre, contenido);
  }
  return responder(res, contenido, `Reporte de ${nombre} generado`);
};

export const ventas = asyncHandler(async (req: Request, res: Response) => {
  const { clienteId, usuarioId } = req.query as unknown as {
    clienteId?: string;
    usuarioId?: string;
  };
  return entregarReporte(req, res, 'ventas', () =>
    reportesService.reporteVentas(rangoDesde(req), req.usuario!.id, {
      clienteId: entero(clienteId),
      usuarioId: entero(usuarioId),
    }),
  );
});

export const pedidos = asyncHandler(async (req: Request, res: Response) => {
  const { estado, clienteId, usuarioId } = req.query as unknown as {
    estado?: string;
    clienteId?: string;
    usuarioId?: string;
  };
  return entregarReporte(req, res, 'pedidos', () =>
    reportesService.reportePedidos(rangoDesde(req), req.usuario!.id, {
      estado: estado as never,
      clienteId: entero(clienteId),
      usuarioId: entero(usuarioId),
    }),
  );
});

export const pagos = asyncHandler(async (req: Request, res: Response) => {
  const { metodo, clienteId } = req.query as unknown as {
    metodo?: string;
    clienteId?: string;
  };
  return entregarReporte(req, res, 'pagos', () =>
    reportesService.reportePagos(rangoDesde(req), req.usuario!.id, {
      metodo: metodo as MetodoPago | undefined,
      clienteId: entero(clienteId),
    }),
  );
});

export const entregas = asyncHandler(async (req: Request, res: Response) => {
  const { repartidorId, resultado } = req.query as unknown as {
    repartidorId?: string;
    resultado?: string;
  };
  return entregarReporte(req, res, 'entregas', () =>
    reportesService.reporteEntregas(rangoDesde(req), req.usuario!.id, {
      repartidorId: entero(repartidorId),
      resultado: resultado as never,
    }),
  );
});

export const clientes = asyncHandler(async (req: Request, res: Response) =>
  entregarReporte(req, res, 'clientes', () =>
    reportesService.reporteClientes(rangoDesde(req), req.usuario!.id),
  ),
);

export const bidones = asyncHandler(async (req: Request, res: Response) => {
  const { clienteId, repartidorId } = req.query as unknown as {
    clienteId?: string;
    repartidorId?: string;
  };
  return entregarReporte(req, res, 'bidones', () =>
    reportesService.reporteBidones(rangoDesde(req), req.usuario!.id, {
      clienteId: entero(clienteId),
      repartidorId: entero(repartidorId),
    }),
  );
});

export const inventario = asyncHandler(async (req: Request, res: Response) =>
  entregarReporte(req, res, 'inventario', () =>
    reportesService.reporteInventario(rangoDesde(req), req.usuario!.id),
  ),
);

export const tiemposProceso = asyncHandler(async (req: Request, res: Response) =>
  entregarReporte(req, res, 'tiempos_proceso', () =>
    reportesService.reporteTiemposProceso(rangoDesde(req), req.usuario!.id),
  ),
);

export const diario = asyncHandler(async (req: Request, res: Response) => {
  const { fecha } = req.query as unknown as { fecha?: string };
  const consolidado = await reportesService.consolidadoDiario(
    fecha ? normalizarFecha(fecha) : new Date(),
    req.usuario!.id,
  );
  return responder(res, consolidado, 'Consolidado diario obtenido');
});

/**
 * Consulta cruda del historial de envases, que es el indicador de la tesis
 * "tiempo promedio de consulta del historial de envases". La duración real se
 * registra en LogConsulta y se muestra en el reporte de tiempos.
 */
export const historialBidones = asyncHandler(async (req: Request, res: Response) => {
  const { clienteId } = req.params as unknown as { clienteId: string };
  const { productoId } = req.query as unknown as { productoId?: string };
  const resultado = await reportesService.consultaHistorialBidones(
    Number(clienteId),
    req.usuario!.id,
    entero(productoId),
  );
  return responder(res, resultado, 'Historial de envases del cliente obtenido');
});

/** Evidencia técnica: las consultas más costosas registradas por el sistema. */
export const costoConsultas = asyncHandler(async (_req: Request, res: Response) => {
  const consultas = await prisma.logConsulta.findMany({
    orderBy: { duracionMs: 'desc' },
    take: 20,
  });
  return responder(res, consultas, 'Consultas más costosas obtenidas');
});
