import type { Request, Response } from 'express';
import { responder } from '../middlewares/respuesta';
import { asyncHandler } from '../utils/asyncHandler';
import { prisma } from '../config/prisma';
import { config } from '../config';

/**
 * SALUD DEL SISTEMA
 *
 * `/salud` es público y comprueba que la base de datos responda con un
 * `SELECT 1`. Si no responde, contesta 503 en lugar de 200: un monitor que
 * solo recibiera 200 creería que el sistema funciona cuando no puede atender
 * ninguna petición de negocio. Que el proceso responda no basta.
 *
 * El proceso y la base se distinguen igual: si nadie contesta, el proceso no
 * está; si contesta 503, el proceso vive y la base no. Por eso el entorno, la
 * versión y el nombre de la base viajan también en la respuesta fallida: el
 * frontend usa el entorno para saber si lo que muestra es una demostración.
 *
 * `/salud/completa` sigue siendo el diagnóstico detallado: verifica Prisma y
 * devuelve recuentos y memoria, y por eso exige sesión de administrador.
 */

const version = process.env.npm_package_version ?? '1.0.0';

/** De los dos, el que decide si lo que se ve es real o una demostración. */
const entornoEfectivo = config.entorno === 'prod' ? config.env : config.entorno;

/** Campos comunes: el monitor recibe los mismos en el 200 y en el 503. */
const parteComun = () => ({
  entorno: entornoEfectivo,
  version,
  baseDeDatos: config.baseDeDatos,
  horaServidor: new Date().toISOString(),
});

export const salud = asyncHandler(async (_req: Request, res: Response) => {
  const inicio = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    return res.status(503).json({
      exito: false,
      mensaje: 'El servicio responde, pero la base de datos no está disponible',
      codigo: 'BASE_NO_DISPONIBLE',
      datos: {
        estado: 'SIN_BASE',
        ...parteComun(),
        latenciaBaseMs: Date.now() - inicio,
      },
    });
  }

  return responder(
    res,
    {
      estado: 'OK',
      ...parteComun(),
      latenciaBaseMs: Date.now() - inicio,
    },
    'Servicio disponible',
  );
});

export const saludCompleta = asyncHandler(async (_req: Request, res: Response) => {
  const inicio = Date.now();
  const [conexion, pedidos, ventas] = await Promise.all([
    prisma.$queryRaw<{ ahora: Date }[]>`SELECT NOW() AS ahora`,
    prisma.pedido.count(),
    prisma.venta.count(),
  ]);

  return responder(
    res,
    {
      estado: 'OK',
      entorno: entornoEfectivo,
      baseDeDatos: {
        conectado: true,
        nombre: config.baseDeDatos,
        servidor: 'MariaDB/MySQL',
        horaServidor: conexion[0]?.ahora ?? null,
        latenciaMs: Date.now() - inicio,
      },
      registros: { pedidos, ventas },
      memoria: {
        rssMb: Math.round(process.memoryUsage().rss / 1_048_576),
        heapUsadoMb: Math.round(process.memoryUsage().heapUsed / 1_048_576),
      },
      version,
    },
    'Sistema operativo',
  );
});
