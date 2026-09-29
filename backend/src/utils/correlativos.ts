import { prisma } from '../config/prisma';
import type { Prisma } from '@prisma/client';

type ClienteTransaccion = Prisma.TransactionClient | typeof prisma;

const CAMPOS = {
  pedido: 'pedidoContador',
  venta: 'ventaContador',
  entrega: 'entregaContador',
  incidencia: 'incidenciaContador',
  constancia: 'constanciaContador',
} as const;

export type TipoCorrelativo = keyof typeof CAMPOS;

/**
 * Genera códigos de negocio legibles y consecutivos por año.
 * El upsert con incremento se ejecuta dentro de la transacción del servicio,
 * de modo que dos vendedores que registran pedidos al mismo tiempo nunca
 * obtengan el mismo número.
 *
 * Formato: PED-2026-000125
 */
export async function generarCorrelativo(
  tipo: TipoCorrelativo,
  prefijo: string,
  tx: ClienteTransaccion = prisma,
): Promise<string> {
  const anio = new Date().getFullYear();
  const campo = CAMPOS[tipo] as 'pedidoContador';
  const cliente = tx as unknown as {
    correlativo: {
      upsert: (args: unknown) => Promise<Record<string, number>>;
    };
  };

  const registro = await cliente.correlativo.upsert({
    where: { anio },
    create: { anio, [campo]: 1 },
    update: { [campo]: { increment: 1 } },
  });

  return `${prefijo}-${anio}-${String(registro[campo]).padStart(6, '0')}`;
}
