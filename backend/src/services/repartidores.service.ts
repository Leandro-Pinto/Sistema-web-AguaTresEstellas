import { Prisma, AccionHistorial, TipoRegistroHistorial } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ErrorConflicto, ErrorNoEncontrado, ErrorReglaNegocio } from '../utils/errors';
import { construirPaginacion } from '../utils/paginacion';
import { registrarHistorial } from './historial.service';
import type {
  CrearRepartidorInput,
  ListarRepartidoresQuery,
} from '../validators/operaciones.validator';

const SELECT_REPARTIDOR = {
  id: true,
  nombres: true,
  apellidos: true,
  nombre: true,
  documento: true,
  telefono: true,
  direccion: true,
  zona: true,
  activo: true,
  fechaRegistro: true,
  eliminadoEn: true,
} satisfies Prisma.RepartidorSelect;

const construirNombre = (nombres: string, apellidos: string) =>
  `${nombres} ${apellidos}`.replace(/\s+/g, ' ').trim();

export const crearRepartidor = async (entrada: CrearRepartidorInput, usuarioId: number) => {
  const documento = entrada.documento.toUpperCase();
  const dup = await prisma.repartidor.findUnique({ where: { documento } });
  if (dup) throw new ErrorConflicto(`Ya existe un repartidor con el documento ${documento}`, 'REPARTIDOR_DUPLICADO');

  return prisma.$transaction(async (tx) => {
    const repartidor = await tx.repartidor.create({
      data: {
        nombres: entrada.nombres,
        apellidos: entrada.apellidos,
        nombre: construirNombre(entrada.nombres, entrada.apellidos),
        documento,
        telefono: entrada.telefono,
        direccion: entrada.direccion ?? null,
        zona: entrada.zona ?? null,
        activo: entrada.activo,
      },
      select: SELECT_REPARTIDOR,
    });

    await registrarHistorial(
      {
        tipo: TipoRegistroHistorial.REPARTIDOR,
        entidadId: repartidor.id,
        codigo: repartidor.documento,
        estadoNuevo: repartidor.activo ? 'ACTIVO' : 'INACTIVO',
        accion: AccionHistorial.CREADO,
        descripcion: `Repartidor registrado: ${repartidor.nombre}${repartidor.zona ? ` (zona ${repartidor.zona})` : ''}`,
        usuarioId,
      },
      tx,
    );

    return repartidor;
  });
};

export const listarRepartidores = async (filtros: ListarRepartidoresQuery) => {
  const where: Prisma.RepartidorWhereInput = {
    ...(filtros.incluirEliminados === 'true' ? {} : { eliminadoEn: null }),
    ...(filtros.activo !== 'todos' ? { activo: filtros.activo === 'true' } : {}),
    ...(filtros.zona ? { zona: filtros.zona } : {}),
    ...(filtros.busqueda
      ? {
          OR: [
            { nombre: { contains: filtros.busqueda } },
            { documento: { contains: filtros.busqueda } },
            { telefono: { contains: filtros.busqueda } },
          ],
        }
      : {}),
  };

  const [total, datos] = await prisma.$transaction([
    prisma.repartidor.count({ where }),
    prisma.repartidor.findMany({
      where,
      orderBy: { [filtros.ordenarPor ?? 'nombre']: filtros.orden },
      skip: (filtros.pagina - 1) * filtros.limite,
      take: filtros.limite,
      select: SELECT_REPARTIDOR,
    }),
  ]);

  return construirPaginacion(datos, total, filtros.pagina, filtros.limite);
};

export const obtenerRepartidor = async (id: number) => {
  const repartidor = await prisma.repartidor.findUnique({
    where: { id },
    select: {
      ...SELECT_REPARTIDOR,
      _count: { select: { entregas: true } },
      entregas: {
        orderBy: { id: 'desc' },
        take: 10,
        select: {
          id: true,
          estado: true,
          fechaAsignacion: true,
          horaEntrega: true,
          pedido: { select: { id: true, codigo: true, cliente: { select: { nombre: true } } } },
        },
      },
    },
  });
  if (!repartidor) throw new ErrorNoEncontrado('Repartidor');
  return repartidor;
};

/** Listado ligero para el selector de asignación de pedidos. */
export const listarRepartidoresActivos = async () =>
  prisma.repartidor.findMany({
    where: { activo: true, eliminadoEn: null },
    orderBy: { nombre: 'asc' },
    select: { id: true, nombre: true, documento: true, telefono: true, zona: true },
  });

export const actualizarRepartidor = async (
  id: number,
  entrada: Partial<CrearRepartidorInput>,
  usuarioId: number,
) => {
  const actual = await prisma.repartidor.findUnique({ where: { id }, select: SELECT_REPARTIDOR });
  if (!actual) throw new ErrorNoEncontrado('Repartidor');

  if (entrada.activo === false) {
    const entregasAbiertas = await prisma.entrega.count({
      where: { repartidorId: id, estado: { in: ['ASIGNADA', 'EN_RUTA'] } },
    });
    if (entregasAbiertas > 0) {
      throw new ErrorReglaNegocio(
        `El repartidor tiene ${entregasAbiertas} entrega(s) en curso. Debe cerrarlas antes de desactivarlo.`,
        'REPARTIDOR_CON_ENTREGAS',
      );
    }
  }

  if (entrada.documento && entrada.documento.toUpperCase() !== actual.documento) {
    const dup = await prisma.repartidor.findUnique({ where: { documento: entrada.documento.toUpperCase() } });
    if (dup) throw new ErrorConflicto('Ese documento ya pertenece a otro repartidor', 'REPARTIDOR_DUPLICADO');
  }

  return prisma.$transaction(async (tx) => {
    const repartidor = await tx.repartidor.update({
      where: { id },
      data: {
        ...(entrada.nombres !== undefined ? { nombres: entrada.nombres } : {}),
        ...(entrada.apellidos !== undefined ? { apellidos: entrada.apellidos } : {}),
        ...(entrada.nombres !== undefined || entrada.apellidos !== undefined
          ? {
              nombre: construirNombre(
                entrada.nombres ?? actual.nombres,
                entrada.apellidos ?? actual.apellidos,
              ),
            }
          : {}),
        ...(entrada.documento !== undefined ? { documento: entrada.documento.toUpperCase() } : {}),
        ...(entrada.telefono !== undefined ? { telefono: entrada.telefono } : {}),
        ...(entrada.direccion !== undefined ? { direccion: entrada.direccion } : {}),
        ...(entrada.zona !== undefined ? { zona: entrada.zona } : {}),
        ...(entrada.activo !== undefined ? { activo: entrada.activo } : {}),
      },
      select: SELECT_REPARTIDOR,
    });

    await registrarHistorial(
      {
        tipo: TipoRegistroHistorial.REPARTIDOR,
        entidadId: id,
        codigo: repartidor.documento,
        estadoAnterior: actual.activo ? 'ACTIVO' : 'INACTIVO',
        estadoNuevo: repartidor.activo ? 'ACTIVO' : 'INACTIVO',
        accion: AccionHistorial.ACTUALIZADO,
        descripcion: `Datos del repartidor actualizados: ${repartidor.nombre}`,
        usuarioId,
      },
      tx,
    );

    return repartidor;
  });
};

export const cambiarEstadoRepartidor = async (id: number, activo: boolean, usuarioId: number) =>
  actualizarRepartidor(id, { activo }, usuarioId);

export const eliminarRepartidor = async (id: number, usuarioId: number) => {
  const repartidor = await prisma.repartidor.findUnique({
    where: { id },
    select: { ...SELECT_REPARTIDOR, _count: { select: { entregas: true } } },
  });
  if (!repartidor) throw new ErrorNoEncontrado('Repartidor');
  if (repartidor._count.entregas > 0) {
    throw new ErrorReglaNegocio(
      'El repartidor tiene entregas registradas. No puede eliminarse; desactívelo en su lugar.',
      'REPARTIDOR_CON_ENTREGAS',
    );
  }

  const actualizado = await prisma.repartidor.update({
    where: { id },
    data: { eliminadoEn: new Date(), activo: false },
    select: SELECT_REPARTIDOR,
  });

  await registrarHistorial({
    tipo: TipoRegistroHistorial.REPARTIDOR,
    entidadId: id,
    codigo: repartidor.documento,
    estadoAnterior: 'ACTIVO',
    estadoNuevo: 'ELIMINADO',
    accion: AccionHistorial.ELIMINADO,
    descripcion: `Repartidor eliminado (baja lógica): ${repartidor.nombre}`,
    usuarioId,
  });

  return actualizado;
};

export const restaurarRepartidor = async (id: number, usuarioId: number) => {
  const repartidor = await prisma.repartidor.update({
    where: { id },
    data: { eliminadoEn: null, activo: true },
    select: SELECT_REPARTIDOR,
  });
  await registrarHistorial({
    tipo: TipoRegistroHistorial.REPARTIDOR,
    entidadId: id,
    codigo: repartidor.documento,
    estadoNuevo: 'ACTIVO',
    accion: AccionHistorial.RESTAURADO,
    descripcion: `Repartidor restaurado: ${repartidor.nombre}`,
    usuarioId,
  });
  return repartidor;
};

export const listarZonas = async (): Promise<string[]> => {
  const zonas = await prisma.repartidor.groupBy({
    by: ['zona'],
    where: { eliminadoEn: null, zona: { not: null } },
  });
  return zonas.map((z) => z.zona).filter((z): z is string => z !== null).sort();
};
