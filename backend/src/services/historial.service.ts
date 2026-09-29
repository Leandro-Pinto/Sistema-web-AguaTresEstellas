import { Prisma, TipoRegistroHistorial, AccionHistorial } from '@prisma/client';
import { prisma } from '../config/prisma';
import { construirPaginacion, type ResultadoPaginacion } from '../utils/paginacion';
import type { ListarHistorialQuery } from '../validators/operaciones.validator';

type ClienteTx = Prisma.TransactionClient | typeof prisma;

export interface RegistrarHistorialInput {
  tipo: TipoRegistroHistorial;
  entidadId: number;
  codigo?: string | null;
  estadoAnterior?: string | null;
  estadoNuevo?: string | null;
  accion: AccionHistorial;
  descripcion: string;
  observaciones?: string | null;
  incidencia?: string | null;
  usuarioId: number;
  pedidoId?: number | null;
  ventaId?: number | null;
  pagoId?: number | null;
  fecha?: Date;
}

/**
 * Registro de auditoría. Las entradas NO se eliminan jamás:
 * son la base del indicador "porcentaje de pedidos con trazabilidad completa".
 */
export const registrarHistorial = async (
  datos: RegistrarHistorialInput,
  tx: ClienteTx = prisma,
): Promise<void> => {
  await tx.historialEstado.create({
    data: {
      tipo: datos.tipo,
      entidadId: datos.entidadId,
      codigo: datos.codigo ?? null,
      estadoAnterior: datos.estadoAnterior ?? null,
      estadoNuevo: datos.estadoNuevo ?? null,
      accion: datos.accion,
      descripcion: datos.descripcion,
      observaciones: datos.observaciones ?? null,
      incidencia: datos.incidencia ?? null,
      usuarioId: datos.usuarioId,
      pedidoId: datos.pedidoId ?? null,
      ventaId: datos.ventaId ?? null,
      pagoId: datos.pagoId ?? null,
      fecha: datos.fecha ?? new Date(),
    },
  });
};

/** Atajo para escribir varias entradas dentro de la misma transacción. */
export const registrarHistorialVarios = async (
  lista: RegistrarHistorialInput[],
  tx: ClienteTx,
): Promise<void> => {
  for (const item of lista) {
    await registrarHistorial(item, tx);
  }
};

export const listarHistorial = async (
  filtros: ListarHistorialQuery,
): Promise<ResultadoPaginacion<unknown>> => {
  const where: Prisma.HistorialEstadoWhereInput = {
    ...(filtros.tipo !== 'todos' ? { tipo: filtros.tipo as TipoRegistroHistorial } : {}),
    ...(filtros.entidadId ? { entidadId: filtros.entidadId } : {}),
    ...(filtros.codigo ? { codigo: { contains: filtros.codigo } } : {}),
    ...(filtros.usuarioId ? { usuarioId: filtros.usuarioId } : {}),
    // `accion` es un enum en el esquema, así que se filtra por igualdad.
    // La búsqueda parcial del texto la cubre el filtro de `codigo`.
    ...(filtros.accion ? { accion: filtros.accion as AccionHistorial } : {}),
    ...(filtros.fechaInicio || filtros.fechaFin
      ? {
          fecha: {
            ...(filtros.fechaInicio ? { gte: filtros.fechaInicio } : {}),
            ...(filtros.fechaFin ? { lte: filtros.fechaFin } : {}),
          },
        }
      : {}),
  };

  const orderBy: Prisma.HistorialEstadoOrderByWithRelationInput =
    filtros.ordenarPor === 'fecha' ? { fecha: filtros.orden } : { id: filtros.orden };

  const [total, datos] = await prisma.$transaction([
    prisma.historialEstado.count({ where }),
    prisma.historialEstado.findMany({
      where,
      orderBy,
      skip: (filtros.pagina - 1) * filtros.limite,
      take: filtros.limite,
      include: {
        usuario: { select: { id: true, nombreCompleto: true, rol: { select: { nombre: true } } } },
      },
    }),
  ]);

  return construirPaginacion(datos, total, filtros.pagina, filtros.limite);
};

/**
 * Historial de una entidad concreta (por ejemplo un pedido).
 * Es lo que el personal consulta para saber "qué ocurrió con este pedido".
 */
export const historialDeEntidad = async (
  tipo: TipoRegistroHistorial,
  entidadId: number,
) => {
  const datos = await prisma.historialEstado.findMany({
    where: { tipo, entidadId },
    orderBy: { fecha: 'asc' },
    include: {
      usuario: { select: { id: true, nombreCompleto: true, rol: { select: { nombre: true } } } },
    },
  });
  return datos;
};
