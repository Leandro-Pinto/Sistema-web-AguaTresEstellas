import type { Request, Response } from 'express';
import { responder } from '../middlewares/respuesta';
import { asyncHandler } from '../utils/asyncHandler';
import { prisma } from '../config/prisma';
import { config } from '../config';

/**
 * SALUD DEL SISTEMA
 *
 * `/salud` es público y no toca la base de datos: sirve para comprobar que el
 * proceso arrancó. `/salud/completa` sí verifica Prisma y se usa desde el
 * tablero para saber si el sistema está operativo de extremo a extremo.
 */

const version = process.env.npm_package_version ?? '1.0.0';

export const salud = asyncHandler(async (_req: Request, res: Response) => {
  return responder(
    res,
    {
      estado: 'OK',
      servicio: 'Agua Tres Estrellas Pura - API',
      version,
      entorno: config.env,
      hora: new Date().toISOString(),
      tiempoActivoSegundos: Math.round(process.uptime()),
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
      baseDatos: {
        conectado: true,
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
