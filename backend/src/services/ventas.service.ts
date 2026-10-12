import { Prisma, AccionHistorial, TipoRegistroHistorial, EstadoVenta, MetodoPago } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ErrorConflicto, ErrorNoEncontrado, ErrorReglaNegocio } from '../utils/errors';
import { construirPaginacion } from '../utils/paginacion';
import { generarCorrelativo } from '../utils/correlativos';
import { registrarHistorial } from './historial.service';
import { origenDe, type OpcionesOrigen } from './origen-dato';
import { aplicarMovimientoInventario } from './inventario.service';
import { assertPuedeVender } from './pedidos.service';
import type { CrearVentaInput, ListarVentasQuery } from '../validators/operaciones.validator';

/**
 * Pedido resumido dentro de una venta.
 *
 * Se declara aparte para reutilizarlo en el detalle: antes el detalle
 * reemplazaba el `select` del pedido por uno que solo traía la entrega, y con
 * eso la pantalla de la venta perdía el código del pedido y su dirección.
 */
const SELECT_PEDIDO_DE_VENTA = {
  select: {
    id: true,
    codigo: true,
    estado: true,
    canal: true,
    modalidadEntrega: true,
    direccionEntrega: true,
    entregadoEn: true,
    entrega: {
      select: {
        id: true,
        repartidorId: true,
        estado: true,
        horaSalida: true,
        horaEntrega: true,
        recibeFirma: true,
        repartidor: { select: { id: true, nombre: true, documento: true } },
      },
    },
  },
} satisfies Prisma.VentaSelect['pedido'];

const SELECT_VENTA = {
  id: true,
  numero: true,
  pedidoId: true,
  clienteId: true,
  usuarioId: true,
  fecha: true,
  subtotal: true,
  descuento: true,
  total: true,
  totalPagado: true,
  saldo: true,
  estado: true,
  constanciaEmitida: true,
  constanciaCodigo: true,
  constanciaEmitidaEn: true,
  observaciones: true,
  anuladaEn: true,
  motivoAnulacion: true,
  cliente: {
    select: { id: true, nombre: true, documento: true, telefono: true, direccion: true },
  },
  usuario: { select: { id: true, nombreCompleto: true } },
  pedido: SELECT_PEDIDO_DE_VENTA,
  detalles: {
    orderBy: { id: 'asc' },
    select: {
      id: true,
      productoId: true,
      cantidad: true,
      precioUnitario: true,
      subtotal: true,
      costoUnitario: true,
      producto: { select: { id: true, codigo: true, nombre: true, unidadMedida: true, esRetornable: true } },
    },
  },
  pagos: {
    orderBy: { id: 'asc' },
    select: {
      id: true,
      monto: true,
      metodo: true,
      referencia: true,
      fecha: true,
      estado: true,
      observaciones: true,
    },
  },
} satisfies Prisma.VentaSelect;

/**
 * REGISTRO DE VENTA A PARTIR DE UN PEDIDO.
 *
 * Reglas de integridad aplicadas dentro de UNA transacción:
 *  1. El pedido debe estar confirmado (no basta con estar pendiente).
 *  2. Un pedido no puede generar dos ventas activas.
 *  3. Los precios y costos se COPIAN del detalle del pedido: la venta queda
 *     congelada y un cambio de precio posterior no la altera.
 *  4. La venta descuenta el stock mediante movimientos de inventario.
 *
 * El tiempo entre la confirmación del pedido y la creación de la venta es el
 * indicador "tiempo promedio de procesamiento de una venta".
 */
export const crearVenta = async (
  entrada: CrearVentaInput,
  usuarioId: number,
  opciones?: OpcionesOrigen,
) => {
  const origen = origenDe(opciones);
  return prisma.$transaction(async (tx) => {
    const pedido = await tx.pedido.findUnique({
      where: { id: entrada.pedidoId },
      select: {
        id: true,
        codigo: true,
        estado: true,
        clienteId: true,
        total: true,
        venta: { select: { id: true, numero: true, estado: true } },
        detalles: {
          select: {
            id: true,
            productoId: true,
            cantidad: true,
            precioUnitario: true,
            subtotal: true,
            producto: { select: { id: true, nombre: true, costoUnitario: true, esRetornable: true } },
          },
        },
      },
    });

    if (!pedido) throw new ErrorNoEncontrado('Pedido');
    assertPuedeVender(pedido.estado, pedido.venta !== null);

    if (pedido.detalles.length === 0) {
      throw new ErrorReglaNegocio('El pedido no tiene productos, no se puede generar la venta', 'PEDIDO_SIN_DETALLE');
    }

    // Regla 2 reforzada: se bloquea la fila del pedido para que dos usuarios
    // que pulsen "registrar venta" a la vez no generen dos ventas.
    const bloqueado = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM pedidos WHERE id = ${pedido.id} FOR UPDATE
    `;
    if (bloqueado.length === 0) throw new ErrorNoEncontrado('Pedido');

    const duplicada = await tx.venta.findUnique({ where: { pedidoId: pedido.id } });
    if (duplicada) {
      throw new ErrorConflicto(
        `El pedido ya tiene la venta ${duplicada.numero}. No se pueden generar dos ventas para un mismo pedido.`,
        'VENTA_DUPLICADA',
      );
    }

    const subtotal = pedido.detalles.reduce((a, d) => a + Number(d.subtotal), 0);
    const descuento = entrada.descuento;
    if (descuento > subtotal) {
      throw new ErrorReglaNegocio('El descuento no puede ser mayor al subtotal', 'DESCUENTO_INVALIDO');
    }
    const total = Number((subtotal - descuento).toFixed(2));

    const numero = await generarCorrelativo('venta', 'VEN', tx);

    const venta = await tx.venta.create({
      data: {
        numero,
        pedidoId: pedido.id,
        clienteId: pedido.clienteId,
        usuarioId,
        fecha: new Date(),
        subtotal: Number(subtotal.toFixed(2)),
        descuento,
        total,
        totalPagado: 0,
        saldo: total,
        estado: 'PENDIENTE',
        observaciones: entrada.observaciones ?? null,
        origen,
        detalles: {
          create: pedido.detalles.map((d) => ({
            productoId: d.productoId,
            cantidad: d.cantidad,
            precioUnitario: d.precioUnitario,
            subtotal: d.subtotal,
            costoUnitario: d.producto.costoUnitario,
          })),
        },
      },
      select: SELECT_VENTA,
    });

    // Regla 4: la venta genera la salida de inventario, un movimiento por producto.
    for (const detalle of venta.detalles) {
      await aplicarMovimientoInventario(
        {
          productoId: detalle.productoId,
          tipo: 'SALIDA',
          cantidad: detalle.cantidad,
          usuarioId,
          origen: 'VENTA',
          observaciones: `Venta ${venta.numero} del pedido ${pedido.codigo}`,
          pedidoId: pedido.id,
          ventaId: venta.id,
          // El movimiento hereda la procedencia de la venta que lo provoca.
          procedencia: origen,
        },
        tx,
      );
    }

    await registrarHistorial(
      {
        tipo: TipoRegistroHistorial.VENTA,
        entidadId: venta.id,
        codigo: venta.numero,
        estadoNuevo: 'PENDIENTE',
        accion: AccionHistorial.CREADO,
        descripcion: `Venta ${venta.numero} generada del pedido ${pedido.codigo} por S/ ${venta.total}`,
        observaciones: entrada.observaciones ?? null,
        usuarioId,
        pedidoId: pedido.id,
        ventaId: venta.id,
        origen,
      },
      tx,
    );

    // Pago inicial en el mismo paso: es lo habitual cuando el cliente paga
    // al momento de emitir el pedido.
    if (entrada.pagoInicial && entrada.pagoInicial.monto > 0) {
      if (entrada.pagoInicial.monto > total) {
        throw new ErrorReglaNegocio(
          `El pago inicial (S/ ${entrada.pagoInicial.monto}) supera el total de la venta (S/ ${total})`,
          'PAGO_EXCEDE_TOTAL',
        );
      }
      const pago = await tx.pago.create({
        data: {
          ventaId: venta.id,
          monto: entrada.pagoInicial.monto,
          metodo: entrada.pagoInicial.metodo as MetodoPago,
          referencia: entrada.pagoInicial.referencia ?? null,
          observaciones: entrada.pagoInicial.observaciones ?? null,
          recibidoPorId: usuarioId,
          origen,
        },
      });
      const totalPagado = entrada.pagoInicial.monto;
      const saldo = Number((total - totalPagado).toFixed(2));
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
          descripcion: `Pago de S/ ${totalPagado} (${entrada.pagoInicial.metodo}) registrado al crear la venta ${venta.numero}`,
          usuarioId,
          ventaId: venta.id,
          pagoId: pago.id,
          pedidoId: pedido.id,
          origen,
        },
        tx,
      );
    }

    return tx.venta.findUniqueOrThrow({ where: { id: venta.id }, select: SELECT_VENTA });
  });
};

export const listarVentas = async (filtros: ListarVentasQuery) => {
  const where: Prisma.VentaWhereInput = {
    ...(filtros.estado !== 'todos' ? { estado: filtros.estado as EstadoVenta } : {}),
    ...(filtros.clienteId ? { clienteId: filtros.clienteId } : {}),
    ...(filtros.pedidoId ? { pedidoId: filtros.pedidoId } : {}),
    ...(filtros.usuarioId ? { usuarioId: filtros.usuarioId } : {}),
    ...(filtros.soloConSaldo === 'true' ? { saldo: { gt: 0 }, estado: { not: 'ANULADA' } } : {}),
    ...(filtros.soloSinConstancia === 'true' ? { constanciaEmitida: false, estado: { not: 'ANULADA' } } : {}),
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
            { numero: { contains: filtros.busqueda.toUpperCase() } },
            { cliente: { nombre: { contains: filtros.busqueda } } },
            { cliente: { documento: { contains: filtros.busqueda } } },
            { pedido: { codigo: { contains: filtros.busqueda.toUpperCase() } } },
          ],
        }
      : {}),
  };

  const campo = filtros.ordenarPor ?? 'fecha';
  const orderBy =
    { total: { total: filtros.orden }, numero: { numero: filtros.orden }, cliente: { cliente: { nombre: filtros.orden } } }[campo] ??
    { [campo]: filtros.orden };

  const [total, datos] = await prisma.$transaction([
    prisma.venta.count({ where }),
    prisma.venta.findMany({
      where,
      orderBy,
      skip: (filtros.pagina - 1) * filtros.limite,
      take: filtros.limite,
      select: SELECT_VENTA,
    }),
  ]);

  return construirPaginacion(datos, total, filtros.pagina, filtros.limite);
};

export const obtenerVenta = async (id: number) => {
  const venta = await prisma.venta.findUnique({
    where: { id },
    select: {
      ...SELECT_VENTA,
      movimientosInventario: {
        select: {
          id: true,
          tipo: true,
          cantidad: true,
          stockAnterior: true,
          stockResultante: true,
          origen: true,
          fecha: true,
          producto: { select: { nombre: true } },
        },
      },
    },
  });
  if (!venta) throw new ErrorNoEncontrado('Venta');
  return venta;
};

/**
 * Emisión de la constancia / nota de venta.
 * El sistema no hace facturación electrónica (fuera de alcance), pero sí
 * genera y registra un comprobante imprimible, que forma parte del criterio
 * de "venta procesada correctamente".
 */
export const emitirConstancia = async (id: number, usuarioId: number, opciones?: OpcionesOrigen) => {
  const venta = await prisma.venta.findUnique({
    where: { id },
    select: { id: true, numero: true, estado: true, constanciaEmitida: true, constanciaCodigo: true, total: true },
  });
  if (!venta) throw new ErrorNoEncontrado('Venta');
  if (venta.estado === 'ANULADA') {
    throw new ErrorReglaNegocio('No se puede emitir la constancia de una venta anulada', 'VENTA_ANULADA');
  }
  if (venta.constanciaEmitida) {
    throw new ErrorReglaNegocio(
      `La venta ya tiene la constancia ${venta.constanciaCodigo}`,
      'CONSTANCIA_YA_EMITIDA',
    );
  }

  return prisma.$transaction(async (tx) => {
    const codigo = await generarCorrelativo('constancia', 'CONST', tx);
    const actualizada = await tx.venta.update({
      where: { id },
      data: {
        constanciaEmitida: true,
        constanciaCodigo: codigo,
        constanciaEmitidaEn: new Date(),
      },
      select: SELECT_VENTA,
    });

    await registrarHistorial(
      {
        tipo: TipoRegistroHistorial.VENTA,
        entidadId: id,
        codigo: actualizada.numero,
        accion: AccionHistorial.ACTUALIZADO,
        descripcion: `Constancia ${codigo} emitida para la venta ${actualizada.numero} (S/ ${actualizada.total})`,
        usuarioId,
        ventaId: id,
        pedidoId: actualizada.pedidoId,
        origen: origenDe(opciones),
      },
      tx,
    );

    return actualizada;
  });
};

/**
 * Anulación de venta: devuelve el inventario y deja constancia del motivo.
 * No borra nada; el registro permanece para la auditoría.
 */
export const anularVenta = async (
  id: number,
  motivo: string,
  reponerInventario: boolean,
  usuarioId: number,
) => {
  const venta = await prisma.venta.findUnique({
    where: { id },
    select: {
      id: true,
      numero: true,
      estado: true,
      pedidoId: true,
      detalles: { select: { productoId: true, cantidad: true, producto: { select: { nombre: true } } } },
      pagos: { where: { estado: 'REGISTRADO' }, select: { id: true, monto: true } },
    },
  });
  if (!venta) throw new ErrorNoEncontrado('Venta');
  if (venta.estado === 'ANULADA') {
    throw new ErrorReglaNegocio('La venta ya está anulada', 'VENTA_YA_ANULADA');
  }
  if (venta.pagos.length > 0 && !reponerInventario) {
    throw new ErrorReglaNegocio(
      `La venta tiene ${venta.pagos.length} pago(s) registrado(s). Anule los pagos antes de anular la venta.`,
      'VENTA_CON_PAGOS',
    );
  }

  return prisma.$transaction(async (tx) => {
    if (reponerInventario) {
      for (const detalle of venta.detalles) {
        await aplicarMovimientoInventario(
          {
            productoId: detalle.productoId,
            tipo: 'ENTRADA',
            cantidad: detalle.cantidad,
            usuarioId,
            origen: 'ANULACION VENTA',
            observaciones: `Reposición por anulación de la venta ${venta.numero}`,
            pedidoId: venta.pedidoId,
            ventaId: venta.id,
          },
          tx,
        );
      }
    }

    const actualizada = await tx.venta.update({
      where: { id },
      data: {
        estado: 'ANULADA',
        anuladaEn: new Date(),
        motivoAnulacion: motivo,
        saldo: 0,
      },
      select: SELECT_VENTA,
    });

    await registrarHistorial(
      {
        tipo: TipoRegistroHistorial.VENTA,
        entidadId: id,
        codigo: venta.numero,
        estadoAnterior: venta.estado,
        estadoNuevo: 'ANULADA',
        accion: AccionHistorial.CANCELACION,
        descripcion: `Venta ${venta.numero} anulada. Motivo: ${motivo}`,
        usuarioId,
        ventaId: id,
        pedidoId: venta.pedidoId,
      },
      tx,
    );

    return actualizada;
  });
};

/** Datos para la constancia imprimible (frontend genera el PDF/print). */
export const obtenerConstancia = async (id: number) => {
  const venta = await prisma.venta.findUnique({
    where: { id },
    select: {
      ...SELECT_VENTA,
      pedido: {
        select: {
          codigo: true,
          canal: true,
          modalidadEntrega: true,
          direccionEntrega: true,
          referenciaEntrega: true,
          entregadoEn: true,
          confirmadoEn: true,
          cliente: { select: { documento: true, nombre: true, direccion: true } },
          entrega: {
            select: {
              horaEntrega: true,
              recibeFirma: true,
              repartidor: { select: { nombre: true, documento: true } },
            },
          },
        },
      },
    },
  });
  if (!venta) throw new ErrorNoEncontrado('Venta');

  const empresa = await prisma.empresa.findFirst({ where: { activo: true } });
  return { venta, empresa };
};

export const totalesVentas = async (filtros: { fechaInicio?: Date; fechaFin?: Date; estado?: EstadoVenta }) => {
  return prisma.venta.aggregate({
    where: {
      ...(filtros.fechaInicio || filtros.fechaFin
        ? {
            fecha: {
              ...(filtros.fechaInicio ? { gte: filtros.fechaInicio } : {}),
              ...(filtros.fechaFin ? { lte: filtros.fechaFin } : {}),
            },
          }
        : {}),
      ...(filtros.estado ? { estado: filtros.estado } : {}),
    },
    _sum: { total: true, totalPagado: true, saldo: true },
    _count: true,
  });
};
