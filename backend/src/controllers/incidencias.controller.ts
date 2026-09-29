import type { Request, Response } from 'express';
import { z } from 'zod';
import { responder } from '../middlewares/respuesta';
import { asyncHandler } from '../utils/asyncHandler';
import { prisma } from '../config/prisma';
import { registrarHistorial } from '../services/historial.service';
import { AccionHistorial } from '@prisma/client';
import { generarCorrelativo } from '../utils/correlativos';
import { ErrorNoEncontrado, ErrorValidacion } from '../utils/errors';

/**
 * INCIDENCIAS DEL SISTEMA
 *
 * Cada problema detectado durante la evaluación queda registrado con fecha de
 * inicio y de solución. Ese par es lo que permite calcular el tiempo medio de
 * recuperación (MTTR) del indicador de fiabilidad, y el conjunto completo
 * constituye la evidencia del postest.
 */

const MODULOS = [
  'AUTENTICACION',
  'PEDIDOS',
  'VENTAS',
  'PAGOS',
  'ENTREGAS',
  'BIDONES',
  'INVENTARIO',
  'REPORTES',
  'TABLERO',
  'OTRO',
] as const;

/** Escala de severidad 1 a 4, la misma usada en la ficha del pretest. */
const severidadSchema = z.coerce
  .number()
  .int()
  .min(1, 'Severidad mínima 1')
  .max(4, 'Severidad máxima 4');

const crearSchema = z.object({
  titulo: z.string().trim().min(5, 'Describa el problema').max(200),
  descripcion: z.string().trim().min(10, 'Amplíe la descripción').max(2000),
  pasosReproduccion: z.string().trim().max(2000).optional(),
  modulo: z.enum(MODULOS).default('OTRO'),
  severidad: severidadSchema.default(3),
});

const actualizarSchema = crearSchema.partial();

const resolverSchema = z.object({
  solucion: z.string().trim().min(5, 'Describa la solución aplicada').max(2000),
  severidadFinal: severidadSchema.optional(),
});

const listarSchema = z.object({
  pagina: z.coerce.number().int().positive().default(1),
  limite: z.coerce.number().int().positive().max(100).default(20),
  orden: z.enum(['asc', 'desc']).default('desc'),
  modulo: z.enum(MODULOS).optional(),
  severidad: severidadSchema.optional(),
  estado: z.enum(['ABIERTA', 'EN_PROCESO', 'RESUELTA', 'DESCARTADA']).optional(),
  busqueda: z.string().trim().optional(),
});

/**
 * Valida la entrada de este módulo y devuelve el tipo de SALIDA del esquema,
 * con los valores por defecto ya resueltos.
 */
const analizar = <S extends z.ZodTypeAny>(esquema: S, datos: unknown): z.infer<S> => {
  const resultado = esquema.safeParse(datos);
  if (!resultado.success) {
    const campos = resultado.error.issues.map((i) => ({
      campo: i.path.join('.') || 'general',
      mensaje: i.message,
    }));
    throw new ErrorValidacion('Los datos de la incidencia no son válidos', campos);
  }
  return resultado.data;
};

const SELECT_INCIDENCIA = {
  id: true,
  codigo: true,
  titulo: true,
  descripcion: true,
  pasosReproduccion: true,
  modulo: true,
  severidad: true,
  estado: true,
  inicio: true,
  fin: true,
  duracionMinutos: true,
  solucion: true,
  reportadoPorId: true,
  resueltoPorId: true,
} as const;

export const listar = asyncHandler(async (req: Request, res: Response) => {
  const filtros = analizar(listarSchema, req.query);
  const where = {
    ...(filtros.modulo ? { modulo: filtros.modulo } : {}),
    ...(filtros.severidad ? { severidad: filtros.severidad } : {}),
    ...(filtros.estado ? { estado: filtros.estado } : {}),
    ...(filtros.busqueda
      ? {
          OR: [
            { titulo: { contains: filtros.busqueda } },
            { codigo: { contains: filtros.busqueda } },
            { descripcion: { contains: filtros.busqueda } },
          ],
        }
      : {}),
  };

  const [incidencias, total, resumen] = await Promise.all([
    prisma.incidenciaSistema.findMany({
      where,
      orderBy: { inicio: filtros.orden },
      skip: (filtros.pagina - 1) * filtros.limite,
      take: filtros.limite,
      select: SELECT_INCIDENCIA,
    }),
    prisma.incidenciaSistema.count({ where }),
    prisma.incidenciaSistema.groupBy({ by: ['estado'], _count: { _all: true } }),
  ]);

  return responder(res, incidencias, 'Incidencias listadas', 200, {
    paginacion: {
      pagina: filtros.pagina,
      limite: filtros.limite,
      total,
      // El nombre de la clave debe ser `totalPaginas`: es la que lee el
      // frontend en `leerPaginacion`. Con `paginas` el paginador recibía 0.
      totalPaginas: Math.ceil(total / filtros.limite),
    },
    resumenPorEstado: resumen.map((r) => ({ estado: r.estado, cantidad: r._count._all })),
  });
});

export const obtener = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const incidencia = await prisma.incidenciaSistema.findUnique({
    where: { id: Number(id) },
    select: SELECT_INCIDENCIA,
  });
  if (!incidencia) throw new ErrorNoEncontrado('La incidencia no existe');
  return responder(res, incidencia, 'Incidencia obtenida');
});

export const crear = asyncHandler(async (req: Request, res: Response) => {
  const datos = analizar(crearSchema, req.body);
  const inicio = new Date();

  const incidencia = await prisma.$transaction(async (tx) => {
    const codigo = await generarCorrelativo('incidencia', 'INC', tx);
    return tx.incidenciaSistema.create({
      data: {
        codigo,
        titulo: datos.titulo,
        descripcion: datos.descripcion,
        pasosReproduccion: datos.pasosReproduccion ?? null,
        modulo: datos.modulo,
        severidad: datos.severidad,
        inicio,
        reportadoPorId: req.usuario?.id ?? null,
      },
      select: SELECT_INCIDENCIA,
    });
  });

  return responder(res, incidencia, `Incidencia ${incidencia.codigo} registrada`, 201);
});

export const actualizar = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const datos = analizar(actualizarSchema, req.body);
  const incidenciaId = Number(id);

  const existente = await prisma.incidenciaSistema.findUnique({
    where: { id: incidenciaId },
    select: { id: true },
  });
  if (!existente) throw new ErrorNoEncontrado('La incidencia no existe');

  const incidencia = await prisma.incidenciaSistema.update({
    where: { id: incidenciaId },
    data: {
      ...(datos.titulo !== undefined ? { titulo: datos.titulo } : {}),
      ...(datos.descripcion !== undefined ? { descripcion: datos.descripcion } : {}),
      ...(datos.pasosReproduccion !== undefined
        ? { pasosReproduccion: datos.pasosReproduccion }
        : {}),
      ...(datos.modulo !== undefined ? { modulo: datos.modulo } : {}),
      ...(datos.severidad !== undefined ? { severidad: datos.severidad } : {}),
    },
    select: SELECT_INCIDENCIA,
  });

  await registrarHistorial({
    tipo: 'INCIDENCIA',
    entidadId: incidencia.id,
    accion: AccionHistorial.ACTUALIZADO,
    descripcion: `Incidencia ${incidencia.codigo} actualizada`,
    usuarioId: req.usuario!.id,
  });

  return responder(res, incidencia, 'Incidencia actualizada');
});

/**
 * Marca la incidencia como resuelta y calcula los minutos efectivos. Es el
 * dato que alimenta el tiempo medio de recuperación en los indicadores.
 */
export const resolver = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const datos = analizar(resolverSchema, req.body);
  const incidenciaId = Number(id);

  const existente = await prisma.incidenciaSistema.findUnique({
    where: { id: incidenciaId },
    select: { id: true, inicio: true, estado: true },
  });
  if (!existente) throw new ErrorNoEncontrado('La incidencia no existe');

  const fin = new Date();
  const duracionMinutos = Math.max(
    1,
    Math.round((fin.getTime() - existente.inicio.getTime()) / 60_000),
  );

  const incidencia = await prisma.incidenciaSistema.update({
    where: { id: incidenciaId },
    data: {
      estado: 'RESUELTA',
      solucion: datos.solucion,
      fin,
      duracionMinutos,
      ...(datos.severidadFinal !== undefined ? { severidad: datos.severidadFinal } : {}),
      resueltoPorId: req.usuario?.id ?? null,
    },
    select: SELECT_INCIDENCIA,
  });

  await registrarHistorial({
    tipo: 'INCIDENCIA',
    entidadId: incidencia.id,
    accion: AccionHistorial.ACTUALIZADO,
    descripcion: `Incidencia ${incidencia.codigo} resuelta en ${duracionMinutos} min`,
    usuarioId: req.usuario!.id,
  });

  return responder(res, incidencia, 'Incidencia resuelta y registrada en la evidencia');
});

export const descartar = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const { motivo } = req.body as { motivo?: string };
  const fin = new Date();
  const incidencia = await prisma.incidenciaSistema.update({
    where: { id: Number(id) },
    data: {
      estado: 'DESCARTADA',
      solucion: motivo ?? 'Descartada durante la revisión',
      fin,
      resueltoPorId: req.usuario?.id ?? null,
    },
    select: SELECT_INCIDENCIA,
  });
  return responder(res, incidencia, 'Incidencia descartada');
});

/**
 * Indicador de fiabilidad: tiempo medio de recuperación y taux de resolución.
 * Se expone aquí porque la evidencia se calcula desde el mismo origen de
 * verdad que las incidencias, sin planillas paralelas.
 */
export const resumenFiabilidad = asyncHandler(async (_req: Request, res: Response) => {
  const [resueltas, abiertas, tiempoTotal] = await Promise.all([
    prisma.incidenciaSistema.aggregate({
      where: { estado: 'RESUELTA' },
      _count: { _all: true },
      _avg: { duracionMinutos: true },
    }),
    prisma.incidenciaSistema.count({ where: { estado: { in: ['ABIERTA', 'EN_PROCESO'] } } }),
    prisma.incidenciaSistema.aggregate({
      where: { estado: { not: 'DESCARTADA' } },
      _count: { _all: true },
    }),
  ]);

  const total = tiempoTotal._count._all;
  const mttr = resueltas._avg.duracionMinutos ?? 0;

  return responder(
    res,
    {
      totalRegistradas: total,
      resueltas: resueltas._count._all,
      pendientes: abiertas,
      tasaResolucion: total > 0 ? Number(((resueltas._count._all / total) * 100).toFixed(2)) : 0,
      mttrMinutos: Number(mttr.toFixed(2)),
    },
    'Resumen de fiabilidad calculado',
  );
});

/** Bitácora HTTP: evidencia de trazabilidad de cada operación del sistema. */
export const bitacora = asyncHandler(async (req: Request, res: Response) => {
  const filtros = analizar(
    z.object({
      pagina: z.coerce.number().int().positive().default(1),
      limite: z.coerce.number().int().positive().max(200).default(50),
      orden: z.enum(['asc', 'desc']).default('desc'),
      metodo: z.string().trim().optional(),
      ruta: z.string().trim().optional(),
      estado: z.coerce.number().int().optional(),
    }),
    req.query,
  );

  const where = {
    ...(filtros.metodo ? { metodo: filtros.metodo.toUpperCase() } : {}),
    ...(filtros.ruta ? { ruta: { contains: filtros.ruta } } : {}),
    ...(filtros.estado !== undefined ? { status: filtros.estado } : {}),
  };

  const [registros, total] = await Promise.all([
    prisma.bitacoraHttp.findMany({
      where,
      orderBy: { fecha: filtros.orden },
      skip: (filtros.pagina - 1) * filtros.limite,
      take: filtros.limite,
    }),
    prisma.bitacoraHttp.count({ where }),
  ]);

  return responder(res, registros, 'Bitácora HTTP obtenida', 200, {
    paginacion: {
      pagina: filtros.pagina,
      limite: filtros.limite,
      total,
      // Misma clave que el resto de módulos; ver la nota en `listar`.
      totalPaginas: Math.ceil(total / filtros.limite),
    },
  });
});
