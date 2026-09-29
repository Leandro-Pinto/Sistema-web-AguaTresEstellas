import { Prisma, AccionHistorial, TipoRegistroHistorial, EstadoPago, MetodoPago } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ErrorNoEncontrado, ErrorReglaNegocio } from '../utils/errors';
import { construirPaginacion } from '../utils/paginacion';
import { registrarHistorial } from './historial.service';
import type { CrearPagoInput, ListarPagosQuery } from '../validators/operaciones.validator';

const SELECT_PAGO = {
  id: true,
  ventaId: true,
  monto: true,
  metodo: true,
  referencia: true,
  fecha: true,
  estado: true,
  observaciones: true,
  creadoEn: true,
  anuladoEn: true,
  motivoAnulacion: true,
  recibidoPor: { select: { id: true, nombreCompleto: true } },
  venta: {
    select: {
      id: true,
      numero: true,
      total: true,
      totalPagado: true,
      saldo: true,
      estado: true,
      cliente: { select: { id: true, nombre: true, documento: true, telefono: true } },
    },
  },
} satisfies Prisma.PagoSelect;

/**
 * REGISTRO DE PAGO.
 *
 * Regla de negocio: el monto acumulado de los pagos no puede superar
 * el total de la venta. Se valida dentro de la misma transacción que
 * actualiza el saldo, de modo que dos cobros simultáneos no superen la deuda.
 */
export const crearPago = async (entrada: CrearPagoInput, usuarioId: number) => {
  return prisma.$transaction(async (tx) => {
    const venta = await tx.venta.findUnique({
      where: { id: entrada.ventaId },
      select: {
        id: true,
        numero: true,
        total: true,
        totalPagado: true,
        saldo: true,
        estado: true,
        pedidoId: true,
        cliente: { select: { nombre: true } },
      },
    });
    if (!venta) throw new ErrorNoEncontrado('Venta');
    if (venta.estado === 'ANULADA') {
      throw new ErrorReglaNegocio('No se pueden registrar pagos en una venta anulada', 'VENTA_ANULADA');
    }

    if (entrada.monto > Number(venta.saldo)) {
      throw new ErrorReglaNegocio(
        `El pago de S/ ${entrada.monto} supera el saldo pendiente de la venta ${venta.numero}, que es de S/ ${venta.saldo}`,
        'PAGO_EXCEDE_SALDO',
      );
    }

    const pago = await tx.pago.create({
      data: {
        ventaId: venta.id,
        monto: entrada.monto,
        metodo: entrada.metodo as MetodoPago,
        referencia: entrada.referencia ?? null,
        observaciones: entrada.observaciones ?? null,
        fecha: entrada.fecha ?? new Date(),
        estado: 'REGISTRADO',
        recibidoPorId: usuarioId,
      },
      select: SELECT_PAGO,
    });

    const totalPagado = Number((Number(venta.totalPagado) + entrada.monto).toFixed(2));
    const saldo = Number((Number(venta.total) - totalPagado).toFixed(2));

    await tx.venta.update({
      where: { id: venta.id },
      data: {
        totalPagado,
        saldo,
        estado: saldo <= 0 ? 'COMPLETADA' : 'PENDIENTE',
      },
    });

    await registrarHistorial(
      {
        tipo: TipoRegistroHistorial.PAGO,
        entidadId: pago.id,
        codigo: venta.numero,
        estadoNuevo: 'REGISTRADO',
        accion: AccionHistorial.PAGO_REGISTRADO,
        descripcion: `Pago de S/ ${entrada.monto} por ${entrada.metodo} en la venta ${venta.numero} (${venta.cliente.nombre}). Saldo restante: S/ ${saldo}`,
        observaciones: entrada.observaciones ?? null,
        usuarioId,
        ventaId: venta.id,
        pagoId: pago.id,
        pedidoId: venta.pedidoId,
        fecha: entrada.fecha ?? new Date(),
      },
      tx,
    );

    return { pago, totalPagado, saldo };
  });
};

export const listarPagos = async (filtros: ListarPagosQuery) => {
  const where: Prisma.PagoWhereInput = {
    ...(filtros.ventaId ? { ventaId: filtros.ventaId } : {}),
    ...(filtros.clienteId ? { venta: { clienteId: filtros.clienteId } } : {}),
    ...(filtros.metodo !== 'todos' ? { metodo: filtros.metodo as MetodoPago } : {}),
    ...(filtros.estado !== 'todos' ? { estado: filtros.estado as EstadoPago } : {}),
    ...(filtros.fechaInicio || filtros.fechaFin
      ? {
          fecha: {
            ...(filtros.fechaInicio ? { gte: filtros.fechaInicio } : {}),
            ...(filtros.fechaFin ? { lte: filtros.fechaFin } : {}),
          },
        }
      : {}),
    ...(filtros.busqueda
      ? {
          OR: [
            { referencia: { contains: filtros.busqueda } },
            { venta: { numero: { contains: filtros.busqueda.toUpperCase() } } },
            { venta: { cliente: { nombre: { contains: filtros.busqueda } } } },
          ],
        }
      : {}),
  };

  const [total, datos, resumen] = await prisma.$transaction([
    prisma.pago.count({ where }),
    prisma.pago.findMany({
      where,
      orderBy: { [filtros.ordenarPor ?? 'fecha']: filtros.orden },
      skip: (filtros.pagina - 1) * filtros.limite,
      take: filtros.limite,
      select: SELECT_PAGO,
    }),
    prisma.pago.aggregate({
      where: { ...where, estado: 'REGISTRADO' },
      _sum: { monto: true },
      _count: true,
    }),
  ]);

  return {
    ...construirPaginacion(datos, total, filtros.pagina, filtros.limite),
    resumen: {
      totalCobrado: Number(resumen._sum.monto ?? 0),
      cantidadPagos: resumen._count,
    },
  };
};

export const obtenerPago = async (id: number) => {
  const pago = await prisma.pago.findUnique({ where: { id }, select: SELECT_PAGO });
  if (!pago) throw new ErrorNoEncontrado('Pago');
  return pago;
};

/**
 * Anulación de un pago: recalcula el total pagado y el saldo de la venta.
 * El pago no se elimina; queda como ANULADO para que la diferencia entre
 * lo cobrado y lo registrado sea siempre auditable.
 */
export const anularPago = async (id: number, motivo: string, usuarioId: number) => {
  return prisma.$transaction(async (tx) => {
    const pago = await tx.pago.findUnique({
      where: { id },
      select: {
        id: true,
        monto: true,
        estado: true,
        ventaId: true,
        venta: { select: { id: true, numero: true, total: true, totalPagado: true, estado: true, pedidoId: true } },
      },
    });
    if (!pago) throw new ErrorNoEncontrado('Pago');
    if (pago.estado === 'ANULADO') throw new ErrorReglaNegocio('El pago ya está anulado', 'PAGO_ANULADO');

    const actualizado = await tx.pago.update({
      where: { id },
      data: { estado: 'ANULADO', anuladoEn: new Date(), motivoAnulacion: motivo },
      select: SELECT_PAGO,
    });

    const totalPagado = Number((Number(pago.venta.totalPagado) - Number(pago.monto)).toFixed(2));
    const saldo = Number((Number(pago.venta.total) - totalPagado).toFixed(2));

    await tx.venta.update({
      where: { id: pago.ventaId },
      data: {
        totalPagado,
        saldo,
        estado: pago.venta.estado === 'ANULADA' ? 'ANULADA' : saldo <= 0 ? 'COMPLETADA' : 'PENDIENTE',
      },
    });

    await registrarHistorial(
      {
        tipo: TipoRegistroHistorial.PAGO,
        entidadId: id,
        codigo: pago.venta.numero,
        estadoAnterior: 'REGISTRADO',
        estadoNuevo: 'ANULADO',
        accion: AccionHistorial.CANCELACION,
        descripcion: `Pago de S/ ${pago.monto} anulado. Motivo: ${motivo}`,
        usuarioId,
        ventaId: pago.ventaId,
        pagoId: id,
        pedidoId: pago.venta.pedidoId,
      },
      tx,
    );

    return { pago: actualizado, totalPagado, saldo };
  });
};

/** Totales por método de pago: base del gráfico "ventas por método de pago". */
export const resumenPorMetodo = async (fechaInicio?: Date, fechaFin?: Date) => {
  const where: Prisma.PagoWhereInput = {
    estado: 'REGISTRADO',
    ...(fechaInicio || fechaFin
      ? {
          fecha: {
            ...(fechaInicio ? { gte: fechaInicio } : {}),
            ...(fechaFin ? { lte: fechaFin } : {}),
          },
        }
      : {}),
  };

  const agrupado = await prisma.pago.groupBy({
    by: ['metodo'],
    where,
    _sum: { monto: true },
    _count: true,
  });

  return agrupado.map((a) => ({
    metodo: a.metodo,
    total: Number(a._sum.monto ?? 0),
    cantidad: a._count,
  }));
};
